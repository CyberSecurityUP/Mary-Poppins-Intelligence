"""
Mary Poppins — Graph Intelligence Engine
Neo4j-backed entity graph for investigation correlation.
Powers the Maltego-style graph visualization.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Optional

logger = logging.getLogger("mp.graph")


class NodeType(str, Enum):
    PERSON = "Person"
    EMAIL = "Email"
    PHONE = "Phone"
    USERNAME = "Username"
    IP_ADDRESS = "IPAddress"
    DOMAIN = "Domain"
    CRYPTO_WALLET = "CryptoWallet"
    CONTENT_HASH = "ContentHash"
    FORUM_POST = "ForumPost"
    ONION_SERVICE = "OnionService"
    CHAT_MESSAGE = "ChatMessage"
    SOCIAL_PROFILE = "SocialMediaProfile"
    GEO_LOCATION = "GeoLocation"
    ORGANIZATION = "Organization"
    CASE = "Case"


class RelationType(str, Enum):
    USES_EMAIL = "USES_EMAIL"
    HAS_PHONE = "HAS_PHONE"
    KNOWN_AS = "KNOWN_AS"
    CONNECTED_TO = "CONNECTED_TO"
    POSTED_ON = "POSTED_ON"
    SENT_TO = "SENT_TO"
    RECEIVED_FROM = "RECEIVED_FROM"
    HOSTED_ON = "HOSTED_ON"
    RESOLVES_TO = "RESOLVES_TO"
    OWNS_WALLET = "OWNS_WALLET"
    TRANSACTED_WITH = "TRANSACTED_WITH"
    LOCATED_AT = "LOCATED_AT"
    MEMBER_OF = "MEMBER_OF"
    COMMUNICATES_WITH = "COMMUNICATES_WITH"
    SHARES_CONTENT = "SHARES_CONTENT"
    LINKED_TO = "LINKED_TO"
    INVESTIGATED_IN = "INVESTIGATED_IN"


@dataclass
class GraphNode:
    id: str
    node_type: NodeType
    properties: dict[str, Any] = field(default_factory=dict)
    risk_score: float = 0.0
    label: str = ""


@dataclass
class GraphEdge:
    source_id: str
    target_id: str
    relation_type: RelationType
    properties: dict[str, Any] = field(default_factory=dict)
    weight: float = 1.0


@dataclass
class GraphSubset:
    """A subgraph returned for visualization."""
    nodes: list[GraphNode] = field(default_factory=list)
    edges: list[GraphEdge] = field(default_factory=list)
    total_nodes: int = 0
    total_edges: int = 0
    truncated: bool = False


@dataclass
class PathResult:
    paths: list[list[GraphNode]]
    shortest_length: int
    total_paths_found: int


class GraphIntelligenceService:
    """
    Core graph intelligence engine powered by Neo4j.
    Provides entity correlation, path finding, community detection,
    and subgraph extraction for the investigation UI.
    """

    def __init__(self, neo4j_driver, settings):
        self._driver = neo4j_driver
        self._settings = settings

    # ── Node operations ──────────────────────────────────────────────

    async def create_node(
        self,
        node_type: NodeType,
        properties: dict[str, Any],
        case_id: Optional[str] = None,
    ) -> GraphNode:
        """Create a new node in the investigation graph."""
        query = f"""
        CREATE (n:{node_type.value} $props)
        SET n.created_at = datetime()
        SET n.id = randomUUID()
        RETURN n
        """
        async with self._driver.session(database=self._settings.database) as session:
            result = await session.run(query, props=properties)
            record = await result.single()
            node_data = dict(record["n"])

            if case_id:
                await self._link_to_case(session, node_data["id"], case_id)

            return GraphNode(
                id=node_data["id"],
                node_type=node_type,
                properties=node_data,
                label=properties.get("value", properties.get("name", "")),
            )

    async def get_node(self, node_id: str) -> Optional[GraphNode]:
        """Retrieve a node by ID."""
        query = """
        MATCH (n {id: $node_id})
        RETURN n, labels(n) as labels
        """
        async with self._driver.session(database=self._settings.database) as session:
            result = await session.run(query, node_id=node_id)
            record = await result.single()
            if not record:
                return None

            node_data = dict(record["n"])
            labels = record["labels"]
            node_type = NodeType(labels[0]) if labels else NodeType.PERSON

            return GraphNode(
                id=node_data.get("id", node_id),
                node_type=node_type,
                properties=node_data,
                risk_score=node_data.get("risk_score", 0.0),
                label=node_data.get("value", node_data.get("name", "")),
            )

    # ── Relationship operations ──────────────────────────────────────

    async def create_relationship(
        self,
        source_id: str,
        target_id: str,
        relation_type: RelationType,
        properties: Optional[dict[str, Any]] = None,
    ) -> GraphEdge:
        """Create a relationship between two nodes."""
        props = properties or {}
        query = f"""
        MATCH (a {{id: $source_id}})
        MATCH (b {{id: $target_id}})
        CREATE (a)-[r:{relation_type.value} $props]->(b)
        SET r.created_at = datetime()
        RETURN r
        """
        async with self._driver.session(database=self._settings.database) as session:
            await session.run(query, source_id=source_id, target_id=target_id, props=props)

        return GraphEdge(
            source_id=source_id,
            target_id=target_id,
            relation_type=relation_type,
            properties=props,
        )

    # ── Graph queries ────────────────────────────────────────────────

    async def expand_node(
        self,
        node_id: str,
        depth: int = 1,
        relation_types: Optional[list[RelationType]] = None,
        max_nodes: int = 100,
    ) -> GraphSubset:
        """
        Expand a node's neighborhood — the primary investigation action.
        Returns connected nodes and edges up to the specified depth.
        """
        rel_filter = ""
        if relation_types:
            rel_names = "|".join(r.value for r in relation_types)
            rel_filter = f":{rel_names}"

        query = f"""
        MATCH path = (start {{id: $node_id}})-[r{rel_filter}*1..{depth}]-(connected)
        WITH start, connected, relationships(path) as rels, nodes(path) as path_nodes
        LIMIT $max_nodes
        RETURN DISTINCT connected, labels(connected) as labels,
               [rel in rels | {{type: type(rel), start: startNode(rel).id, end: endNode(rel).id, props: properties(rel)}}] as rel_details
        """
        nodes_map: dict[str, GraphNode] = {}
        edges: list[GraphEdge] = []

        async with self._driver.session(database=self._settings.database) as session:
            result = await session.run(query, node_id=node_id, max_nodes=max_nodes)

            async for record in result:
                node_data = dict(record["connected"])
                labels = record["labels"]
                nid = node_data.get("id", "")

                if nid and nid not in nodes_map:
                    node_type = NodeType(labels[0]) if labels else NodeType.PERSON
                    nodes_map[nid] = GraphNode(
                        id=nid,
                        node_type=node_type,
                        properties=node_data,
                        risk_score=node_data.get("risk_score", 0.0),
                        label=node_data.get("value", node_data.get("name", "")),
                    )

                for rel in record["rel_details"]:
                    edges.append(GraphEdge(
                        source_id=rel["start"],
                        target_id=rel["end"],
                        relation_type=RelationType(rel["type"]),
                        properties=rel.get("props", {}),
                    ))

        # Deduplicate edges
        seen_edges: set[tuple[str, str, str]] = set()
        unique_edges = []
        for edge in edges:
            key = (edge.source_id, edge.target_id, edge.relation_type.value)
            if key not in seen_edges:
                seen_edges.add(key)
                unique_edges.append(edge)

        return GraphSubset(
            nodes=list(nodes_map.values()),
            edges=unique_edges,
            total_nodes=len(nodes_map),
            total_edges=len(unique_edges),
            truncated=len(nodes_map) >= max_nodes,
        )

    async def find_shortest_paths(
        self,
        source_id: str,
        target_id: str,
        max_depth: int = 10,
        max_paths: int = 5,
    ) -> PathResult:
        """Find shortest paths between two entities — key investigation query."""
        query = """
        MATCH path = shortestPath(
            (a {id: $source_id})-[*1..""" + str(max_depth) + """]->(b {id: $target_id})
        )
        RETURN path, length(path) as path_length
        ORDER BY path_length
        LIMIT $max_paths
        """
        paths: list[list[GraphNode]] = []
        shortest = float("inf")

        async with self._driver.session(database=self._settings.database) as session:
            result = await session.run(
                query, source_id=source_id, target_id=target_id, max_paths=max_paths,
            )
            async for record in result:
                path_length = record["path_length"]
                shortest = min(shortest, path_length)

                path_nodes = []
                for node in record["path"].nodes:
                    node_data = dict(node)
                    labels = list(node.labels)
                    node_type = NodeType(labels[0]) if labels else NodeType.PERSON
                    path_nodes.append(GraphNode(
                        id=node_data.get("id", ""),
                        node_type=node_type,
                        properties=node_data,
                        label=node_data.get("value", ""),
                    ))
                paths.append(path_nodes)

        return PathResult(
            paths=paths,
            shortest_length=int(shortest) if paths else 0,
            total_paths_found=len(paths),
        )

    async def get_case_subgraph(
        self,
        case_id: str,
        max_nodes: int = 500,
    ) -> GraphSubset:
        """Get the full entity graph for a case."""
        query = """
        MATCH (c:Case {id: $case_id})<-[:INVESTIGATED_IN]-(entity)
        WITH entity
        OPTIONAL MATCH (entity)-[r]-(connected)
        WHERE (connected)-[:INVESTIGATED_IN]->(:Case {id: $case_id})
        RETURN entity, labels(entity) as entity_labels,
               connected, labels(connected) as connected_labels,
               type(r) as rel_type, properties(r) as rel_props,
               startNode(r).id as rel_start, endNode(r).id as rel_end
        LIMIT $max_nodes
        """
        nodes_map: dict[str, GraphNode] = {}
        edges: list[GraphEdge] = []

        async with self._driver.session(database=self._settings.database) as session:
            result = await session.run(query, case_id=case_id, max_nodes=max_nodes)

            async for record in result:
                # Process entity node
                entity_data = dict(record["entity"])
                entity_id = entity_data.get("id", "")
                if entity_id and entity_id not in nodes_map:
                    labels = record["entity_labels"]
                    nodes_map[entity_id] = GraphNode(
                        id=entity_id,
                        node_type=NodeType(labels[0]) if labels else NodeType.PERSON,
                        properties=entity_data,
                        risk_score=entity_data.get("risk_score", 0.0),
                        label=entity_data.get("value", entity_data.get("name", "")),
                    )

                # Process connected node
                if record["connected"]:
                    conn_data = dict(record["connected"])
                    conn_id = conn_data.get("id", "")
                    if conn_id and conn_id not in nodes_map:
                        conn_labels = record["connected_labels"]
                        nodes_map[conn_id] = GraphNode(
                            id=conn_id,
                            node_type=NodeType(conn_labels[0]) if conn_labels else NodeType.PERSON,
                            properties=conn_data,
                            risk_score=conn_data.get("risk_score", 0.0),
                            label=conn_data.get("value", conn_data.get("name", "")),
                        )

                    if record["rel_type"]:
                        edges.append(GraphEdge(
                            source_id=record["rel_start"],
                            target_id=record["rel_end"],
                            relation_type=RelationType(record["rel_type"]),
                            properties=record["rel_props"] or {},
                        ))

        return GraphSubset(
            nodes=list(nodes_map.values()),
            edges=edges,
            total_nodes=len(nodes_map),
            total_edges=len(edges),
            truncated=len(nodes_map) >= max_nodes,
        )

    # ── Analytics queries ────────────────────────────────────────────

    async def find_communities(self, case_id: Optional[str] = None) -> list[dict]:
        """
        Run community detection (Louvain) on the entity graph.
        Identifies clusters of tightly connected entities.
        """
        filter_clause = ""
        params: dict[str, Any] = {}
        if case_id:
            filter_clause = "WHERE (n)-[:INVESTIGATED_IN]->(:Case {id: $case_id})"
            params["case_id"] = case_id

        query = f"""
        CALL gds.graph.project('investigation', '*', '*')
        YIELD graphName
        CALL gds.louvain.stream('investigation')
        YIELD nodeId, communityId
        WITH gds.util.asNode(nodeId) AS n, communityId
        {filter_clause}
        RETURN communityId, collect({{
            id: n.id, type: labels(n)[0], value: n.value, risk_score: n.risk_score
        }}) AS members, count(*) AS size
        ORDER BY size DESC
        """
        communities = []
        async with self._driver.session(database=self._settings.database) as session:
            try:
                result = await session.run(query, **params)
                async for record in result:
                    communities.append({
                        "community_id": record["communityId"],
                        "members": record["members"],
                        "size": record["size"],
                    })
            finally:
                # Clean up projected graph
                await session.run("CALL gds.graph.drop('investigation', false)")

        return communities

    async def compute_centrality(
        self,
        case_id: Optional[str] = None,
        algorithm: str = "pagerank",
    ) -> list[dict]:
        """
        Compute node centrality scores to find key entities.
        Supports PageRank, betweenness centrality, and degree centrality.
        """
        algo_map = {
            "pagerank": "gds.pageRank.stream",
            "betweenness": "gds.betweenness.stream",
            "degree": "gds.degree.stream",
        }
        if algorithm not in algo_map:
            raise ValueError(f"Unsupported algorithm: {algorithm}")

        query = f"""
        CALL gds.graph.project('centrality_graph', '*', '*')
        YIELD graphName
        CALL {algo_map[algorithm]}('centrality_graph')
        YIELD nodeId, score
        WITH gds.util.asNode(nodeId) AS n, score
        RETURN n.id AS id, labels(n)[0] AS type, n.value AS value,
               n.risk_score AS risk_score, score
        ORDER BY score DESC
        LIMIT 50
        """
        results = []
        async with self._driver.session(database=self._settings.database) as session:
            try:
                result = await session.run(query)
                async for record in result:
                    results.append({
                        "id": record["id"],
                        "type": record["type"],
                        "value": record["value"],
                        "risk_score": record["risk_score"],
                        "centrality_score": record["score"],
                    })
            finally:
                await session.run("CALL gds.graph.drop('centrality_graph', false)")

        return results

    # ── Helpers ───────────────────────────────────────────────────────

    async def _link_to_case(self, session, node_id: str, case_id: str) -> None:
        """Link a node to a case via INVESTIGATED_IN relationship."""
        query = """
        MATCH (n {id: $node_id})
        MATCH (c:Case {id: $case_id})
        MERGE (n)-[:INVESTIGATED_IN]->(c)
        """
        await session.run(query, node_id=node_id, case_id=case_id)

    async def search_nodes(
        self,
        query_text: str,
        node_types: Optional[list[NodeType]] = None,
        limit: int = 20,
    ) -> list[GraphNode]:
        """Full-text search across graph nodes."""
        type_filter = ""
        if node_types:
            labels = ":".join(nt.value for nt in node_types)
            type_filter = f"AND any(l in labels(n) WHERE l IN [{','.join(repr(nt.value) for nt in node_types)}])"

        query = f"""
        MATCH (n)
        WHERE (n.value CONTAINS $query OR n.name CONTAINS $query
               OR n.display_label CONTAINS $query)
        {type_filter}
        RETURN n, labels(n) as labels
        ORDER BY n.risk_score DESC
        LIMIT $limit
        """
        results = []
        async with self._driver.session(database=self._settings.database) as session:
            result = await session.run(query, query=query_text, limit=limit)
            async for record in result:
                node_data = dict(record["n"])
                labels = record["labels"]
                results.append(GraphNode(
                    id=node_data.get("id", ""),
                    node_type=NodeType(labels[0]) if labels else NodeType.PERSON,
                    properties=node_data,
                    risk_score=node_data.get("risk_score", 0.0),
                    label=node_data.get("value", node_data.get("name", "")),
                ))
        return results
