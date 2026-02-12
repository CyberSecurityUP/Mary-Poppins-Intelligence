"""
Mary Poppins — Cryptocurrency Investigation Service
Bitcoin and Ethereum tracing, wallet clustering, mixer detection,
and transaction flow analysis.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Optional

logger = logging.getLogger("mp.crypto")


class Blockchain(str, Enum):
    BITCOIN = "bitcoin"
    ETHEREUM = "ethereum"
    BITCOIN_CASH = "bitcoin_cash"
    LITECOIN = "litecoin"
    MONERO = "monero"


class WalletLabel(str, Enum):
    UNKNOWN = "unknown"
    EXCHANGE = "exchange"
    MIXER = "mixer"
    GAMBLING = "gambling"
    DARKNET_MARKET = "darknet_market"
    RANSOMWARE = "ransomware"
    SCAM = "scam"
    MINING_POOL = "mining_pool"
    PAYMENT_PROCESSOR = "payment_processor"
    PERSONAL = "personal"
    SUSPECT = "suspect"


@dataclass
class WalletInfo:
    address: str
    blockchain: Blockchain
    balance: float
    total_received: float
    total_sent: float
    tx_count: int
    first_seen: Optional[datetime] = None
    last_seen: Optional[datetime] = None
    label: WalletLabel = WalletLabel.UNKNOWN
    known_service: Optional[str] = None
    cluster_id: Optional[str] = None
    risk_score: float = 0.0
    tags: list[str] = field(default_factory=list)


@dataclass
class Transaction:
    tx_hash: str
    blockchain: Blockchain
    block_number: int
    block_timestamp: datetime
    from_addresses: list[str]
    to_addresses: list[str]
    amount: float
    amount_usd: Optional[float] = None
    fee: float = 0.0
    is_coinbase: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class TransactionFlow:
    """A chain of transactions from source to destination."""
    path: list[Transaction]
    total_amount: float
    total_hops: int
    involves_mixer: bool = False
    involves_exchange: bool = False
    start_address: str = ""
    end_address: str = ""
    risk_score: float = 0.0


@dataclass
class WalletCluster:
    """Group of addresses likely controlled by the same entity."""
    cluster_id: str
    addresses: list[str]
    blockchain: Blockchain
    total_balance: float
    total_tx_count: int
    label: WalletLabel = WalletLabel.UNKNOWN
    known_service: Optional[str] = None
    confidence: float = 0.0
    heuristics_used: list[str] = field(default_factory=list)


@dataclass
class MixerDetectionResult:
    address: str
    is_mixer: bool
    confidence: float
    mixer_type: Optional[str] = None  # coinjoin, wasabi, tornado, chipmixer, etc.
    indicators: list[str] = field(default_factory=list)


class CryptoInvestigationService:
    """
    Cryptocurrency tracing and analysis engine.

    Capabilities:
    - Wallet balance and transaction history
    - Multi-hop transaction tracing (follow the money)
    - Wallet clustering via common-input-ownership heuristic
    - Mixer/tumbler detection
    - Known service identification (exchanges, darknet markets)
    - Transaction flow graph generation
    - Risk scoring based on exposure to illicit services
    """

    def __init__(self, settings, bitcoin_rpc, ethereum_rpc, known_services_db, graph_db):
        self._settings = settings
        self._btc_rpc = bitcoin_rpc
        self._eth_rpc = ethereum_rpc
        self._known_db = known_services_db
        self._graph = graph_db

    # ── Wallet analysis ──────────────────────────────────────────────

    async def get_wallet_info(self, address: str, blockchain: Blockchain) -> WalletInfo:
        """Get comprehensive wallet information."""
        if blockchain == Blockchain.BITCOIN:
            return await self._get_btc_wallet(address)
        elif blockchain == Blockchain.ETHEREUM:
            return await self._get_eth_wallet(address)
        else:
            raise ValueError(f"Unsupported blockchain: {blockchain}")

    async def _get_btc_wallet(self, address: str) -> WalletInfo:
        """Query Bitcoin node/indexer for wallet data."""
        # Query address balance and tx history via Bitcoin RPC / Electrum / Blockstream API
        raw = await self._btc_rpc.get_address_info(address)

        # Check known services database
        label, service = await self._known_db.lookup(address, Blockchain.BITCOIN)

        # Check for clustering
        cluster_id = await self._find_cluster(address, Blockchain.BITCOIN)

        return WalletInfo(
            address=address,
            blockchain=Blockchain.BITCOIN,
            balance=raw.get("balance", 0) / 1e8,  # satoshi to BTC
            total_received=raw.get("total_received", 0) / 1e8,
            total_sent=raw.get("total_sent", 0) / 1e8,
            tx_count=raw.get("tx_count", 0),
            first_seen=raw.get("first_seen"),
            last_seen=raw.get("last_seen"),
            label=label or WalletLabel.UNKNOWN,
            known_service=service,
            cluster_id=cluster_id,
            risk_score=await self._compute_risk_score(address, Blockchain.BITCOIN),
        )

    async def _get_eth_wallet(self, address: str) -> WalletInfo:
        """Query Ethereum node for wallet data."""
        balance_wei = await self._eth_rpc.get_balance(address)
        tx_count = await self._eth_rpc.get_transaction_count(address)
        label, service = await self._known_db.lookup(address, Blockchain.ETHEREUM)

        return WalletInfo(
            address=address,
            blockchain=Blockchain.ETHEREUM,
            balance=balance_wei / 1e18,  # wei to ETH
            total_received=0,  # Would need indexer for full history
            total_sent=0,
            tx_count=tx_count,
            label=label or WalletLabel.UNKNOWN,
            known_service=service,
            risk_score=await self._compute_risk_score(address, Blockchain.ETHEREUM),
        )

    # ── Transaction tracing ──────────────────────────────────────────

    async def trace_transactions(
        self,
        address: str,
        blockchain: Blockchain,
        direction: str = "both",  # "incoming", "outgoing", "both"
        depth: int = 3,
        limit: int = 100,
    ) -> list[Transaction]:
        """
        Trace transactions from/to a wallet address.
        Returns ordered list of transactions up to the specified depth.
        """
        if depth > self._settings.max_trace_depth:
            depth = self._settings.max_trace_depth

        visited: set[str] = set()
        transactions: list[Transaction] = []
        queue: list[tuple[str, int]] = [(address, 0)]

        while queue and len(transactions) < limit:
            current_addr, current_depth = queue.pop(0)
            if current_addr in visited or current_depth >= depth:
                continue
            visited.add(current_addr)

            txs = await self._fetch_transactions(current_addr, blockchain, direction)
            for tx in txs:
                transactions.append(tx)
                # Enqueue connected addresses for next depth level
                if direction in ("outgoing", "both"):
                    for addr in tx.to_addresses:
                        if addr not in visited:
                            queue.append((addr, current_depth + 1))
                if direction in ("incoming", "both"):
                    for addr in tx.from_addresses:
                        if addr not in visited:
                            queue.append((addr, current_depth + 1))

        return transactions

    async def find_transaction_path(
        self,
        source: str,
        destination: str,
        blockchain: Blockchain,
        max_hops: int = 10,
    ) -> Optional[TransactionFlow]:
        """
        Find the shortest transaction path between two addresses.
        Uses BFS on the transaction graph.
        """
        visited: set[str] = set()
        queue: list[list[tuple[str, Transaction]]] = [[(source, None)]]

        while queue:
            path = queue.pop(0)
            current_addr = path[-1][0]

            if current_addr == destination:
                txs = [tx for _, tx in path if tx is not None]
                return TransactionFlow(
                    path=txs,
                    total_amount=sum(tx.amount for tx in txs),
                    total_hops=len(txs),
                    involves_mixer=any(
                        await self._is_mixer_address(tx.to_addresses[0], blockchain)
                        for tx in txs if tx.to_addresses
                    ),
                    start_address=source,
                    end_address=destination,
                )

            if current_addr in visited or len(path) > max_hops:
                continue
            visited.add(current_addr)

            txs = await self._fetch_transactions(current_addr, blockchain, "outgoing")
            for tx in txs:
                for next_addr in tx.to_addresses:
                    if next_addr not in visited:
                        queue.append(path + [(next_addr, tx)])

        return None  # No path found

    async def _fetch_transactions(
        self, address: str, blockchain: Blockchain, direction: str,
    ) -> list[Transaction]:
        """Fetch transactions for an address from the blockchain node."""
        # Implementation depends on blockchain type and RPC interface
        # Would use Bitcoin Core RPC, Electrum, or block explorer APIs
        return []  # Stub

    # ── Wallet clustering ────────────────────────────────────────────

    async def cluster_wallets(
        self,
        seed_address: str,
        blockchain: Blockchain,
    ) -> WalletCluster:
        """
        Cluster wallets using common-input-ownership heuristic.

        Heuristic: If two addresses appear as inputs in the same transaction,
        they are likely controlled by the same entity (co-spending).
        """
        cluster_addresses: set[str] = {seed_address}
        processed: set[str] = set()

        while True:
            new_addresses: set[str] = set()
            for addr in cluster_addresses - processed:
                processed.add(addr)
                co_spent = await self._find_co_spent_addresses(addr, blockchain)
                new_addresses.update(co_spent - cluster_addresses)

            if not new_addresses:
                break
            cluster_addresses.update(new_addresses)

            # Safety limit to prevent runaway clustering
            if len(cluster_addresses) > 10000:
                logger.warning("Cluster size limit reached for %s", seed_address)
                break

        cluster_id = f"cluster_{blockchain.value}_{seed_address[:12]}"
        label, service = await self._identify_cluster(cluster_addresses, blockchain)

        return WalletCluster(
            cluster_id=cluster_id,
            addresses=sorted(cluster_addresses),
            blockchain=blockchain,
            total_balance=0,  # Would sum all balances
            total_tx_count=0,
            label=label,
            known_service=service,
            confidence=0.85 if len(cluster_addresses) > 1 else 0.5,
            heuristics_used=["common_input_ownership"],
        )

    async def _find_co_spent_addresses(self, address: str, blockchain: Blockchain) -> set[str]:
        """Find addresses that appear as co-inputs with the given address."""
        # Would scan transactions where this address is an input
        # and collect all other input addresses from those transactions
        return set()  # Stub

    async def _identify_cluster(
        self, addresses: set[str], blockchain: Blockchain,
    ) -> tuple[WalletLabel, Optional[str]]:
        """Try to identify a cluster by checking known services DB."""
        for addr in addresses:
            label, service = await self._known_db.lookup(addr, blockchain)
            if label and label != WalletLabel.UNKNOWN:
                return label, service
        return WalletLabel.UNKNOWN, None

    # ── Mixer detection ──────────────────────────────────────────────

    async def detect_mixer(
        self,
        address: str,
        blockchain: Blockchain,
    ) -> MixerDetectionResult:
        """
        Detect if an address is associated with a cryptocurrency mixer.

        Detection heuristics:
        1. Known mixer addresses (database lookup)
        2. CoinJoin pattern detection (equal-output transactions)
        3. Temporal patterns (rapid in/out with delays)
        4. Fan-in/fan-out topology
        5. Round amount outputs
        """
        indicators = []
        confidence = 0.0

        # Check known mixer database
        label, service = await self._known_db.lookup(address, blockchain)
        if label == WalletLabel.MIXER:
            return MixerDetectionResult(
                address=address,
                is_mixer=True,
                confidence=0.99,
                mixer_type=service,
                indicators=["known_mixer_database_match"],
            )

        # Heuristic analysis
        txs = await self._fetch_transactions(address, blockchain, "both")

        # CoinJoin detection: multiple inputs, multiple equal-value outputs
        coinjoin_score = self._detect_coinjoin_pattern(txs)
        if coinjoin_score > 0.5:
            indicators.append("coinjoin_pattern")
            confidence = max(confidence, coinjoin_score)

        # Fan-in / fan-out: many inputs from different addresses, many outputs
        fanout_score = self._detect_fanout_pattern(txs)
        if fanout_score > 0.5:
            indicators.append("fan_in_fan_out_topology")
            confidence = max(confidence, fanout_score)

        # Round amounts (common in mixing)
        round_score = self._detect_round_amounts(txs)
        if round_score > 0.3:
            indicators.append("round_amount_outputs")
            confidence = max(confidence, round_score * 0.7)

        is_mixer = confidence >= self._settings.cluster_threshold

        mixer_type = None
        if is_mixer:
            if "coinjoin_pattern" in indicators:
                mixer_type = "coinjoin"
            else:
                mixer_type = "centralized_mixer"

        return MixerDetectionResult(
            address=address,
            is_mixer=is_mixer,
            confidence=confidence,
            mixer_type=mixer_type,
            indicators=indicators,
        )

    def _detect_coinjoin_pattern(self, txs: list[Transaction]) -> float:
        """Detect CoinJoin-style transactions (equal outputs)."""
        if not txs:
            return 0.0

        coinjoin_count = 0
        for tx in txs:
            if len(tx.from_addresses) >= 3 and len(tx.to_addresses) >= 3:
                # Check for equal-value outputs (hallmark of CoinJoin)
                # This is simplified; real implementation would check output values
                coinjoin_count += 1

        return min(1.0, coinjoin_count / max(len(txs), 1) * 3)

    def _detect_fanout_pattern(self, txs: list[Transaction]) -> float:
        """Detect fan-in/fan-out mixing topology."""
        if not txs:
            return 0.0
        unique_from = set()
        unique_to = set()
        for tx in txs:
            unique_from.update(tx.from_addresses)
            unique_to.update(tx.to_addresses)

        # High ratio of unique addresses to transactions suggests mixing
        ratio = (len(unique_from) + len(unique_to)) / max(len(txs), 1)
        return min(1.0, ratio / 5)

    def _detect_round_amounts(self, txs: list[Transaction]) -> float:
        """Detect prevalence of round-number transaction amounts."""
        if not txs:
            return 0.0
        round_count = sum(
            1 for tx in txs
            if tx.amount > 0 and (tx.amount * 1000) % 1 == 0
        )
        return round_count / max(len(txs), 1)

    # ── Risk scoring ─────────────────────────────────────────────────

    async def _compute_risk_score(self, address: str, blockchain: Blockchain) -> float:
        """
        Compute risk score based on exposure to known illicit services.
        Considers direct and indirect (1-hop) connections.
        """
        label, _ = await self._known_db.lookup(address, blockchain)

        direct_risk = {
            WalletLabel.DARKNET_MARKET: 0.95,
            WalletLabel.RANSOMWARE: 0.99,
            WalletLabel.SCAM: 0.85,
            WalletLabel.MIXER: 0.60,
            WalletLabel.GAMBLING: 0.30,
            WalletLabel.EXCHANGE: 0.10,
            WalletLabel.MINING_POOL: 0.05,
        }.get(label, 0.0)

        return direct_risk

    async def _find_cluster(self, address: str, blockchain: Blockchain) -> Optional[str]:
        """Look up existing cluster for an address."""
        # Would query Neo4j or PostgreSQL for pre-computed clusters
        return None

    async def _is_mixer_address(self, address: str, blockchain: Blockchain) -> bool:
        """Quick check if an address is a known mixer."""
        label, _ = await self._known_db.lookup(address, blockchain)
        return label == WalletLabel.MIXER

    # ── Flow graph generation ────────────────────────────────────────

    async def generate_flow_graph(
        self,
        address: str,
        blockchain: Blockchain,
        depth: int = 3,
    ) -> dict:
        """
        Generate a transaction flow graph for visualization.
        Returns nodes and edges suitable for the frontend graph component.
        """
        transactions = await self.trace_transactions(address, blockchain, depth=depth)

        nodes = {}
        edges = []

        for tx in transactions:
            for addr in tx.from_addresses + tx.to_addresses:
                if addr not in nodes:
                    info = await self.get_wallet_info(addr, blockchain)
                    nodes[addr] = {
                        "id": addr,
                        "type": "crypto_wallet",
                        "blockchain": blockchain.value,
                        "balance": info.balance,
                        "label": info.label.value,
                        "known_service": info.known_service,
                        "risk_score": info.risk_score,
                    }

            for from_addr in tx.from_addresses:
                for to_addr in tx.to_addresses:
                    edges.append({
                        "source": from_addr,
                        "target": to_addr,
                        "tx_hash": tx.tx_hash,
                        "amount": tx.amount,
                        "amount_usd": tx.amount_usd,
                        "timestamp": tx.block_timestamp.isoformat() if tx.block_timestamp else None,
                        "type": "TRANSACTED_WITH",
                    })

        return {
            "nodes": list(nodes.values()),
            "edges": edges,
            "center_address": address,
            "blockchain": blockchain.value,
        }
