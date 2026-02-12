/**
 * Mary Poppins — Content Analysis Page
 * AI-powered content analysis with two-panel layout.
 * Zero Visual Exposure — raw images are NEVER stored or displayed.
 * Only hashes, scores, and metadata are shown.
 */
import { useState } from 'react';
import { useToast, useIsDemoTenant } from '../App';
import Modal from '../components/common/Modal';

/* ------------------------------------------------------------------ */
/*  Type definitions                                                   */
/* ------------------------------------------------------------------ */

interface AIScores {
  nsfw: number;
  nsfl: number;
  csamRisk: number;
  ageEstimation: number;
  scene: number;
}

interface AIorNotResult {
  isAiGenerated: boolean;
  confidence: number;
  model: string;
  checkedAt: string;
}

interface LlmAnalysisResult {
  provider: string;
  model: string;
  riskAssessment: 'critical' | 'high' | 'medium' | 'low';
  suggestedAction: string;
  reasoning: string;
}

interface ModelScore {
  modelId: string;
  modelName: string;
  version: string;
  score: number;
  categories: Record<string, number>;
  processingTimeMs: number;
}

interface EnsembleDetails {
  method: string;
  agreement: number;
  modelScores: ModelScore[];
}

interface LocalModelResult {
  modelId: string;
  modelName: string;
  version: string;
  modelType: 'onnx';
  task: 'nsfw_detection' | 'nsfl_detection' | 'age_estimation' | 'scene_classification';
  primaryScore: number;
  categories: Record<string, number>;
  processingTimeMs: number;
  inputSize: string;
  preprocessing: string;
  device: 'cpu' | 'cuda';
}

interface LocalAnalysisResult {
  models: LocalModelResult[];
  totalTimeMs: number;
  device: string;
  analyzedAt: string;
  pipelineVersion: string;
}

interface ContentItem {
  id: string;
  hashPrefix: string;
  hashType: string;
  classifier: string;
  score: number;
  status: 'pending_review' | 'escalated' | 'reviewed' | 'dismissed';
  source: string;
  time: string;
  scores: AIScores;
  aiOrNot: AIorNotResult | null;
  llmAnalysis: LlmAnalysisResult | null;
  ensembleDetails: EnsembleDetails | null;
  localAnalysis: LocalAnalysisResult | null;
}

type StatusFilter = 'all' | 'pending_review' | 'escalated' | 'reviewed' | 'dismissed';

/* ------------------------------------------------------------------ */
/*  Mock data                                                          */
/* ------------------------------------------------------------------ */

const INITIAL_QUEUE: ContentItem[] = [
  {
    id: 'H-90812',
    hashPrefix: 'a7f3c2...e91b',
    hashType: 'SHA-256',
    classifier: 'NSFW',
    score: 0.97,
    status: 'pending_review',
    source: 'Automated Scan',
    time: '3 min ago',
    scores: { nsfw: 0.97, nsfl: 0.12, csamRisk: 0.94, ageEstimation: 0.91, scene: 0.45 },
    aiOrNot: { isAiGenerated: false, confidence: 0.96, model: 'AIorNot v3.2', checkedAt: '2024-12-14T10:32:00Z' },
    llmAnalysis: {
      provider: 'Anthropic',
      model: 'Claude 3.5 Sonnet',
      riskAssessment: 'critical',
      suggestedAction: 'Escalate immediately to NCMEC and preserve chain of custody',
      reasoning: 'Hash metadata analysis indicates high CSAM risk score (0.94) combined with age estimation below threshold. Source pattern matches known distribution vectors. Recommend immediate law enforcement escalation.',
    },
    ensembleDetails: {
      method: 'weighted_average',
      agreement: 0.92,
      modelScores: [
        { modelId: 'nsfw_detector_v3', modelName: 'Internal NSFW v3', version: 'v3', score: 0.97, categories: { explicit_sexual: 0.97, suggestive: 0.89, violence_graphic: 0.05, safe: 0.02 }, processingTimeMs: 42 },
        { modelId: 'yahoo_open_nsfw', modelName: 'Yahoo Open NSFW', version: '1.0', score: 0.94, categories: { nsfw: 0.94, sfw: 0.06 }, processingTimeMs: 28 },
        { modelId: 'nudenet_v3', modelName: 'NudeNet v3', version: 'v3', score: 0.91, categories: { female_breast_exposed: 0.91, safe: 0.04, belly_exposed: 0.03 }, processingTimeMs: 35 },
      ],
    },
    localAnalysis: {
      models: [
        { modelId: 'nsfw_detector_v3', modelName: 'Internal NSFW v3', version: '3.2.1', modelType: 'onnx', task: 'nsfw_detection', primaryScore: 0.97, categories: { explicit_sexual: 0.97, suggestive: 0.89, violence_graphic: 0.05, violence_mild: 0.02, drugs: 0.01, safe: 0.02 }, processingTimeMs: 12, inputSize: '224x224', preprocessing: 'imagenet', device: 'cuda' },
        { modelId: 'yahoo_open_nsfw', modelName: 'Yahoo Open NSFW', version: '1.1.0', modelType: 'onnx', task: 'nsfw_detection', primaryScore: 0.94, categories: { nsfw: 0.94, sfw: 0.06 }, processingTimeMs: 8, inputSize: '224x224', preprocessing: 'caffe', device: 'cuda' },
        { modelId: 'nudenet_v3', modelName: 'NudeNet v3', version: '3.4.0', modelType: 'onnx', task: 'nsfw_detection', primaryScore: 0.91, categories: { female_breast_exposed: 0.91, belly_exposed: 0.03, safe: 0.04, face_female: 0.02 }, processingTimeMs: 18, inputSize: '320x320', preprocessing: 'raw_0_1', device: 'cuda' },
        { modelId: 'nsfl_detector_v1', modelName: 'NSFL Detector', version: '1.0.2', modelType: 'onnx', task: 'nsfl_detection', primaryScore: 0.12, categories: { gore: 0.04, violence_graphic: 0.06, shock: 0.02, disturbing: 0.05, safe: 0.88 }, processingTimeMs: 14, inputSize: '224x224', preprocessing: 'imagenet', device: 'cuda' },
        { modelId: 'age_estimator_v2', modelName: 'Age Estimator', version: '2.3.0', modelType: 'onnx', task: 'age_estimation', primaryScore: 0.91, categories: { child: 0.91, adolescent: 0.06, adult: 0.02, elderly: 0.01 }, processingTimeMs: 10, inputSize: '224x224', preprocessing: 'imagenet', device: 'cuda' },
        { modelId: 'scene_classifier_v1', modelName: 'Scene Classifier', version: '1.2.0', modelType: 'onnx', task: 'scene_classification', primaryScore: 0.45, categories: { indoor_residential: 0.45, online_platform: 0.30, indoor_commercial: 0.12, outdoor: 0.08, ambiguous: 0.05 }, processingTimeMs: 22, inputSize: '299x299', preprocessing: 'imagenet', device: 'cuda' },
      ],
      totalTimeMs: 84,
      device: 'CUDA (NVIDIA A10G)',
      analyzedAt: '2024-12-14T10:31:45Z',
      pipelineVersion: '2.1.0',
    },
  },
  {
    id: 'H-90811',
    hashPrefix: 'b1d4e8...f7a3',
    hashType: 'SHA-256',
    classifier: 'Age Est.',
    score: 0.91,
    status: 'pending_review',
    source: 'NCMEC Match',
    time: '8 min ago',
    scores: { nsfw: 0.88, nsfl: 0.05, csamRisk: 0.91, ageEstimation: 0.93, scene: 0.31 },
    aiOrNot: null,
    llmAnalysis: null,
    ensembleDetails: {
      method: 'weighted_average',
      agreement: 0.78,
      modelScores: [
        { modelId: 'nsfw_detector_v3', modelName: 'Internal NSFW v3', version: 'v3', score: 0.82, categories: { explicit_sexual: 0.82, suggestive: 0.75, safe: 0.08 }, processingTimeMs: 38 },
        { modelId: 'yahoo_open_nsfw', modelName: 'Yahoo Open NSFW', version: '1.0', score: 0.71, categories: { nsfw: 0.71, sfw: 0.29 }, processingTimeMs: 25 },
        { modelId: 'nudenet_v3', modelName: 'NudeNet v3', version: 'v3', score: 0.88, categories: { female_genitalia_covered: 0.88, safe: 0.06 }, processingTimeMs: 31 },
      ],
    },
    localAnalysis: {
      models: [
        { modelId: 'nsfw_detector_v3', modelName: 'Internal NSFW v3', version: '3.2.1', modelType: 'onnx', task: 'nsfw_detection', primaryScore: 0.88, categories: { explicit_sexual: 0.88, suggestive: 0.79, violence_graphic: 0.03, violence_mild: 0.01, drugs: 0.00, safe: 0.05 }, processingTimeMs: 11, inputSize: '224x224', preprocessing: 'imagenet', device: 'cuda' },
        { modelId: 'yahoo_open_nsfw', modelName: 'Yahoo Open NSFW', version: '1.1.0', modelType: 'onnx', task: 'nsfw_detection', primaryScore: 0.85, categories: { nsfw: 0.85, sfw: 0.15 }, processingTimeMs: 9, inputSize: '224x224', preprocessing: 'caffe', device: 'cuda' },
        { modelId: 'nudenet_v3', modelName: 'NudeNet v3', version: '3.4.0', modelType: 'onnx', task: 'nsfw_detection', primaryScore: 0.88, categories: { female_genitalia_covered: 0.88, safe: 0.06, belly_exposed: 0.04, face_female: 0.02 }, processingTimeMs: 16, inputSize: '320x320', preprocessing: 'raw_0_1', device: 'cuda' },
        { modelId: 'nsfl_detector_v1', modelName: 'NSFL Detector', version: '1.0.2', modelType: 'onnx', task: 'nsfl_detection', primaryScore: 0.05, categories: { gore: 0.02, violence_graphic: 0.03, shock: 0.01, disturbing: 0.02, safe: 0.95 }, processingTimeMs: 13, inputSize: '224x224', preprocessing: 'imagenet', device: 'cuda' },
        { modelId: 'age_estimator_v2', modelName: 'Age Estimator', version: '2.3.0', modelType: 'onnx', task: 'age_estimation', primaryScore: 0.93, categories: { child: 0.93, adolescent: 0.04, adult: 0.02, elderly: 0.01 }, processingTimeMs: 9, inputSize: '224x224', preprocessing: 'imagenet', device: 'cuda' },
        { modelId: 'scene_classifier_v1', modelName: 'Scene Classifier', version: '1.2.0', modelType: 'onnx', task: 'scene_classification', primaryScore: 0.31, categories: { indoor_residential: 0.31, online_platform: 0.28, indoor_commercial: 0.20, outdoor: 0.14, ambiguous: 0.07 }, processingTimeMs: 20, inputSize: '299x299', preprocessing: 'imagenet', device: 'cuda' },
      ],
      totalTimeMs: 78,
      device: 'CUDA (NVIDIA A10G)',
      analyzedAt: '2024-12-14T10:24:00Z',
      pipelineVersion: '2.1.0',
    },
  },
  {
    id: 'H-90809',
    hashPrefix: 'c9a2f1...d4e6',
    hashType: 'PhotoDNA',
    classifier: 'NSFW',
    score: 0.88,
    status: 'escalated',
    source: 'PhotoDNA Match',
    time: '15 min ago',
    scores: { nsfw: 0.88, nsfl: 0.22, csamRisk: 0.85, ageEstimation: 0.76, scene: 0.55 },
    aiOrNot: { isAiGenerated: true, confidence: 0.82, model: 'AIorNot v3.2', checkedAt: '2024-12-14T10:18:00Z' },
    llmAnalysis: {
      provider: 'OpenAI',
      model: 'GPT-4o',
      riskAssessment: 'high',
      suggestedAction: 'Flag for senior analyst review; AI-generated content with high CSAM indicators',
      reasoning: 'Content flagged as AI-generated with 82% confidence. Despite synthetic origin, CSAM risk indicators remain elevated. AI-generated CSAM carries identical legal severity. Recommend full investigation pipeline.',
    },
    ensembleDetails: {
      method: 'weighted_average',
      agreement: 0.85,
      modelScores: [
        { modelId: 'nsfw_detector_v3', modelName: 'Internal NSFW v3', version: 'v3', score: 0.65, categories: { suggestive: 0.65, explicit_sexual: 0.31, safe: 0.22 }, processingTimeMs: 40 },
        { modelId: 'yahoo_open_nsfw', modelName: 'Yahoo Open NSFW', version: '1.0', score: 0.58, categories: { nsfw: 0.58, sfw: 0.42 }, processingTimeMs: 26 },
        { modelId: 'nudenet_v3', modelName: 'NudeNet v3', version: 'v3', score: 0.62, categories: { female_breast_covered: 0.62, safe: 0.21, belly_exposed: 0.11 }, processingTimeMs: 33 },
      ],
    },
    localAnalysis: null,
  },
  {
    id: 'H-90807',
    hashPrefix: 'f2e7b3...c8d1',
    hashType: 'SHA-256',
    classifier: 'Scene',
    score: 0.74,
    status: 'reviewed',
    source: 'Automated Scan',
    time: '22 min ago',
    scores: { nsfw: 0.42, nsfl: 0.08, csamRisk: 0.31, ageEstimation: 0.22, scene: 0.74 },
    aiOrNot: { isAiGenerated: false, confidence: 0.99, model: 'AIorNot v3.2', checkedAt: '2024-12-14T10:05:00Z' },
    llmAnalysis: {
      provider: 'DeepSeek',
      model: 'DeepSeek-V3',
      riskAssessment: 'low',
      suggestedAction: 'No further action required; archive with standard retention',
      reasoning: 'Scene classification triggered due to environmental factors. All abuse-specific scores are well below threshold. Content does not match any known hash databases. Safe to dismiss.',
    },
    ensembleDetails: null,
    localAnalysis: null,
  },
  {
    id: 'H-90805',
    hashPrefix: 'd5c1a9...b2f4',
    hashType: 'MD5',
    classifier: 'NSFW',
    score: 0.69,
    status: 'dismissed',
    source: 'User Report',
    time: '31 min ago',
    scores: { nsfw: 0.69, nsfl: 0.03, csamRisk: 0.15, ageEstimation: 0.08, scene: 0.62 },
    aiOrNot: null,
    llmAnalysis: null,
    ensembleDetails: null,
    localAnalysis: null,
  },
  {
    id: 'H-90803',
    hashPrefix: 'e8b4d2...a1c7',
    hashType: 'SHA-256',
    classifier: 'NSFL',
    score: 0.92,
    status: 'pending_review',
    source: 'Hash Scanner',
    time: '38 min ago',
    scores: { nsfw: 0.34, nsfl: 0.92, csamRisk: 0.28, ageEstimation: 0.11, scene: 0.87 },
    aiOrNot: { isAiGenerated: false, confidence: 0.91, model: 'AIorNot v3.2', checkedAt: '2024-12-14T09:51:00Z' },
    llmAnalysis: null,
    ensembleDetails: null,
    localAnalysis: null,
  },
  {
    id: 'H-90801',
    hashPrefix: '71fa9c...e3b8',
    hashType: 'PhotoDNA',
    classifier: 'CSAM Risk',
    score: 0.95,
    status: 'escalated',
    source: 'NCMEC Match',
    time: '47 min ago',
    scores: { nsfw: 0.93, nsfl: 0.18, csamRisk: 0.95, ageEstimation: 0.89, scene: 0.41 },
    aiOrNot: null,
    llmAnalysis: {
      provider: 'Anthropic',
      model: 'Claude 3.5 Sonnet',
      riskAssessment: 'critical',
      suggestedAction: 'Immediate NCMEC report required; hash matches known CSAM database entry',
      reasoning: 'PhotoDNA match against NCMEC database confirmed. CSAM risk score 0.95 with corroborating age estimation of 0.89. This hash has been previously identified in 3 prior investigations. Chain of custody documentation is critical.',
    },
    ensembleDetails: null,
    localAnalysis: null,
  },
  {
    id: 'H-90799',
    hashPrefix: '3c8e1a...d9f2',
    hashType: 'SHA-256',
    classifier: 'Age Est.',
    score: 0.71,
    status: 'pending_review',
    source: 'Automated Scan',
    time: '1 hour ago',
    scores: { nsfw: 0.55, nsfl: 0.04, csamRisk: 0.62, ageEstimation: 0.71, scene: 0.29 },
    aiOrNot: null,
    llmAnalysis: null,
    ensembleDetails: null,
    localAnalysis: null,
  },
  {
    id: 'H-90795',
    hashPrefix: '8a4f2c...b7e1',
    hashType: 'SHA-256',
    classifier: 'Document',
    score: 0.45,
    status: 'pending_review',
    source: 'Seized Device — CS-2024-0900',
    time: '2 hours ago',
    scores: { nsfw: 0.12, nsfl: 0.03, csamRisk: 0.08, ageEstimation: 0.05, scene: 0.45 },
    aiOrNot: { isAiGenerated: false, confidence: 0.99, model: 'AIorNot v3.2', checkedAt: '2024-12-14T08:15:00Z' },
    llmAnalysis: {
      provider: 'Anthropic',
      model: 'Claude 3.5 Sonnet',
      riskAssessment: 'medium',
      suggestedAction: 'Route to financial analysis team for transaction record extraction',
      reasoning: 'Document hash from seized device matches financial record pattern. Contains metadata consistent with banking transaction records from JP Morgan accounts linked to shell company network. No abuse content indicators. Route for financial forensics.',
    },
    ensembleDetails: null,
    localAnalysis: null,
  },
  {
    id: 'H-90793',
    hashPrefix: '2d9e7a...c4f8',
    hashType: 'PhotoDNA',
    classifier: 'CSAM Risk',
    score: 0.96,
    status: 'escalated',
    source: 'NCMEC Match — CS-2024-0900',
    time: '3 hours ago',
    scores: { nsfw: 0.94, nsfl: 0.15, csamRisk: 0.96, ageEstimation: 0.93, scene: 0.38 },
    aiOrNot: { isAiGenerated: false, confidence: 0.98, model: 'AIorNot v3.2', checkedAt: '2024-12-14T07:42:00Z' },
    llmAnalysis: {
      provider: 'Anthropic',
      model: 'Claude 3.5 Sonnet',
      riskAssessment: 'critical',
      suggestedAction: 'IMMEDIATE: File CyberTipline report. Hash matches NCMEC database entry #4782-A. Preserve full chain of custody documentation.',
      reasoning: 'PhotoDNA match confirmed against NCMEC database. CSAM risk 0.96 with age estimation 0.93. Hash previously identified in 7 prior investigations across 3 jurisdictions. Device metadata links to seized equipment inventory CS-2024-0900-DEV-047. Mandatory reporting applies.',
    },
    ensembleDetails: null,
    localAnalysis: null,
  },
  {
    id: 'H-90791',
    hashPrefix: 'f1c8d3...a2b9',
    hashType: 'SHA-256',
    classifier: 'Scene',
    score: 0.67,
    status: 'pending_review',
    source: 'Flight Log Scan — CS-2024-0900',
    time: '4 hours ago',
    scores: { nsfw: 0.08, nsfl: 0.02, csamRisk: 0.05, ageEstimation: 0.03, scene: 0.67 },
    aiOrNot: null,
    llmAnalysis: null,
    ensembleDetails: null,
    localAnalysis: null,
  },
  {
    id: 'H-90790',
    hashPrefix: 'f1a2b3...d4e5',
    hashType: 'SHA-256',
    classifier: 'NSFL',
    score: 0.89,
    status: 'pending_review' as const,
    source: 'Dark Web Crawler',
    time: '22 min ago',
    scores: { nsfw: 0.08, nsfl: 0.89, csamRisk: 0.12, ageEstimation: 0.0, scene: 0.67 },
    aiOrNot: null,
    llmAnalysis: {
      provider: 'Anthropic',
      model: 'Claude Sonnet 4.5',
      riskAssessment: 'high' as const,
      suggestedAction: 'Flag for violent content review team. Not sexual in nature but extreme violence/gore detected.',
      reasoning: 'Content metadata indicates high NSFL score (0.89) with minimal NSFW indicators. Hash pattern consistent with graphic violence documentation. Recommend routing to violent extremism review queue.',
    },
    ensembleDetails: {
      method: 'weighted_average',
      agreement: 0.88,
      modelScores: [
        { modelId: 'nsfl_detector_v1', modelName: 'NSFL Detector v1', version: 'v1', score: 0.89, categories: { gore: 0.89, violence_graphic: 0.82, shock: 0.45, safe: 0.03 }, processingTimeMs: 44 },
        { modelId: 'nsfw_detector_v3', modelName: 'Internal NSFW v3', version: 'v3', score: 0.08, categories: { safe: 0.85, violence_graphic: 0.08, explicit_sexual: 0.02 }, processingTimeMs: 39 },
      ],
    },
    localAnalysis: {
      models: [
        { modelId: 'nsfl_detector_v1', modelName: 'NSFL Detector', version: '1.0.2', modelType: 'onnx', task: 'nsfl_detection', primaryScore: 0.89, categories: { gore: 0.89, violence_graphic: 0.82, shock: 0.45, disturbing: 0.38, safe: 0.03 }, processingTimeMs: 15, inputSize: '224x224', preprocessing: 'imagenet', device: 'cuda' },
        { modelId: 'nsfw_detector_v3', modelName: 'Internal NSFW v3', version: '3.2.1', modelType: 'onnx', task: 'nsfw_detection', primaryScore: 0.08, categories: { safe: 0.85, violence_graphic: 0.08, explicit_sexual: 0.02, suggestive: 0.03, drugs: 0.01 }, processingTimeMs: 12, inputSize: '224x224', preprocessing: 'imagenet', device: 'cuda' },
        { modelId: 'yahoo_open_nsfw', modelName: 'Yahoo Open NSFW', version: '1.1.0', modelType: 'onnx', task: 'nsfw_detection', primaryScore: 0.06, categories: { nsfw: 0.06, sfw: 0.94 }, processingTimeMs: 9, inputSize: '224x224', preprocessing: 'caffe', device: 'cuda' },
        { modelId: 'nudenet_v3', modelName: 'NudeNet v3', version: '3.4.0', modelType: 'onnx', task: 'nsfw_detection', primaryScore: 0.04, categories: { safe: 0.92, face_male: 0.04, belly_covered: 0.02, face_female: 0.01 }, processingTimeMs: 17, inputSize: '320x320', preprocessing: 'raw_0_1', device: 'cuda' },
        { modelId: 'age_estimator_v2', modelName: 'Age Estimator', version: '2.3.0', modelType: 'onnx', task: 'age_estimation', primaryScore: 0.00, categories: { adult: 0.72, adolescent: 0.15, elderly: 0.10, child: 0.03 }, processingTimeMs: 10, inputSize: '224x224', preprocessing: 'imagenet', device: 'cuda' },
        { modelId: 'scene_classifier_v1', modelName: 'Scene Classifier', version: '1.2.0', modelType: 'onnx', task: 'scene_classification', primaryScore: 0.67, categories: { outdoor: 0.67, indoor_commercial: 0.15, ambiguous: 0.10, indoor_residential: 0.05, online_platform: 0.03 }, processingTimeMs: 28, inputSize: '299x299', preprocessing: 'imagenet', device: 'cuda' },
      ],
      totalTimeMs: 91,
      device: 'CUDA (NVIDIA A10G)',
      analyzedAt: '2024-12-14T06:40:00Z',
      pipelineVersion: '2.1.0',
    },
  },
  {
    id: 'H-90789',
    hashPrefix: 'c9d8e7...a1b2',
    hashType: 'SHA-256',
    classifier: 'NSFL',
    score: 0.94,
    status: 'escalated' as const,
    source: 'Forum Monitoring',
    time: '35 min ago',
    scores: { nsfw: 0.04, nsfl: 0.94, csamRisk: 0.06, ageEstimation: 0.0, scene: 0.78 },
    aiOrNot: { isAiGenerated: true, confidence: 0.82, model: 'AIorNot v3.2', checkedAt: '2024-12-14T09:15:00Z' },
    llmAnalysis: {
      provider: 'Anthropic',
      model: 'Claude Sonnet 4.5',
      riskAssessment: 'high' as const,
      suggestedAction: 'Route to violent extremism task force. AI-generated propaganda material with extreme gore.',
      reasoning: 'Extremely high NSFL score (0.94) combined with AI-generated verdict suggests synthetic violent propaganda. No sexual content detected. Pattern matches known extremist content distribution.',
    },
    ensembleDetails: {
      method: 'weighted_average',
      agreement: 0.91,
      modelScores: [
        { modelId: 'nsfl_detector_v1', modelName: 'NSFL Detector v1', version: 'v1', score: 0.94, categories: { gore: 0.94, shock: 0.87, violence_graphic: 0.91, safe: 0.01 }, processingTimeMs: 41 },
        { modelId: 'nsfw_detector_v3', modelName: 'Internal NSFW v3', version: 'v3', score: 0.04, categories: { safe: 0.90, violence_mild: 0.04, explicit_sexual: 0.01 }, processingTimeMs: 37 },
      ],
    },
    localAnalysis: {
      models: [
        { modelId: 'nsfl_detector_v1', modelName: 'NSFL Detector', version: '1.0.2', modelType: 'onnx', task: 'nsfl_detection', primaryScore: 0.94, categories: { gore: 0.94, violence_graphic: 0.91, shock: 0.87, disturbing: 0.72, safe: 0.01 }, processingTimeMs: 14, inputSize: '224x224', preprocessing: 'imagenet', device: 'cuda' },
        { modelId: 'nsfw_detector_v3', modelName: 'Internal NSFW v3', version: '3.2.1', modelType: 'onnx', task: 'nsfw_detection', primaryScore: 0.04, categories: { safe: 0.90, violence_mild: 0.04, explicit_sexual: 0.01, suggestive: 0.02, drugs: 0.00 }, processingTimeMs: 11, inputSize: '224x224', preprocessing: 'imagenet', device: 'cuda' },
        { modelId: 'yahoo_open_nsfw', modelName: 'Yahoo Open NSFW', version: '1.1.0', modelType: 'onnx', task: 'nsfw_detection', primaryScore: 0.03, categories: { nsfw: 0.03, sfw: 0.97 }, processingTimeMs: 8, inputSize: '224x224', preprocessing: 'caffe', device: 'cuda' },
        { modelId: 'nudenet_v3', modelName: 'NudeNet v3', version: '3.4.0', modelType: 'onnx', task: 'nsfw_detection', primaryScore: 0.02, categories: { safe: 0.95, face_male: 0.02, belly_covered: 0.01, face_female: 0.01 }, processingTimeMs: 18, inputSize: '320x320', preprocessing: 'raw_0_1', device: 'cuda' },
        { modelId: 'age_estimator_v2', modelName: 'Age Estimator', version: '2.3.0', modelType: 'onnx', task: 'age_estimation', primaryScore: 0.00, categories: { adult: 0.80, adolescent: 0.10, elderly: 0.08, child: 0.02 }, processingTimeMs: 10, inputSize: '224x224', preprocessing: 'imagenet', device: 'cuda' },
        { modelId: 'scene_classifier_v1', modelName: 'Scene Classifier', version: '1.2.0', modelType: 'onnx', task: 'scene_classification', primaryScore: 0.78, categories: { outdoor: 0.78, indoor_commercial: 0.10, ambiguous: 0.06, indoor_residential: 0.04, online_platform: 0.02 }, processingTimeMs: 27, inputSize: '299x299', preprocessing: 'imagenet', device: 'cuda' },
      ],
      totalTimeMs: 88,
      device: 'CUDA (NVIDIA A10G)',
      analyzedAt: '2024-12-14T05:15:00Z',
      pipelineVersion: '2.1.0',
    },
  },
  {
    id: 'H-90788',
    hashPrefix: 'e5f6a7...b8c9',
    hashType: 'PDQ',
    classifier: 'NSFL',
    score: 0.76,
    status: 'pending_review' as const,
    source: 'Automated Scan',
    time: '48 min ago',
    scores: { nsfw: 0.15, nsfl: 0.76, csamRisk: 0.08, ageEstimation: 0.0, scene: 0.52 },
    aiOrNot: null,
    llmAnalysis: null,
    ensembleDetails: {
      method: 'weighted_average',
      agreement: 0.72,
      modelScores: [
        { modelId: 'nsfl_detector_v1', modelName: 'NSFL Detector v1', version: 'v1', score: 0.76, categories: { violence_graphic: 0.76, gore: 0.52, disturbing: 0.41, safe: 0.10 }, processingTimeMs: 43 },
        { modelId: 'nsfw_detector_v3', modelName: 'Internal NSFW v3', version: 'v3', score: 0.15, categories: { violence_mild: 0.15, safe: 0.72, suggestive: 0.05 }, processingTimeMs: 38 },
        { modelId: 'yahoo_open_nsfw', modelName: 'Yahoo Open NSFW', version: '1.0', score: 0.11, categories: { nsfw: 0.11, sfw: 0.89 }, processingTimeMs: 27 },
      ],
    },
    localAnalysis: null,
  },
];

/* ------------------------------------------------------------------ */
/*  Style helpers                                                      */
/* ------------------------------------------------------------------ */

const statusStyle: Record<string, string> = {
  pending_review: 'bg-amber-500/20 text-amber-400',
  escalated: 'bg-red-500/20 text-red-400',
  reviewed: 'bg-emerald-500/20 text-emerald-400',
  dismissed: 'bg-slate-500/20 text-slate-400',
};

const statusLabel: Record<string, string> = {
  pending_review: 'Pending Review',
  escalated: 'Escalated',
  reviewed: 'Reviewed',
  dismissed: 'Dismissed',
};

const riskBadgeStyle: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400',
  high: 'bg-orange-500/20 text-orange-400',
  medium: 'bg-amber-500/20 text-amber-400',
  low: 'bg-emerald-500/20 text-emerald-400',
};

function scoreBarColor(value: number): string {
  if (value >= 0.9) return 'bg-red-500';
  if (value >= 0.7) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function scoreTextColor(value: number): string {
  if (value >= 0.9) return 'text-red-400';
  if (value >= 0.7) return 'text-amber-400';
  return 'text-emerald-400';
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ContentAnalysis() {
  const isDemoTenant = useIsDemoTenant();
  const [queue, setQueue] = useState<ContentItem[]>(isDemoTenant ? INITIAL_QUEUE : []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [linkCaseModalOpen, setLinkCaseModalOpen] = useState(false);
  const [llmProvider, setLlmProvider] = useState<string>('Claude');
  const [runningAiOrNot, setRunningAiOrNot] = useState<string | null>(null);
  const [runningLlm, setRunningLlm] = useState<string | null>(null);
  const [runningLocalAnalysis, setRunningLocalAnalysis] = useState<string | null>(null);
  const { addToast } = useToast();

  const [showSubmitPanel, setShowSubmitPanel] = useState(false);
  const [submitMode, setSubmitMode] = useState<'upload' | 'url' | 'hash'>('upload');
  const [submitUrl, setSubmitUrl] = useState('');
  const [submitHash, setSubmitHash] = useState('');
  const [submitHashType, setSubmitHashType] = useState('SHA-256');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedItem = queue.find(q => q.id === selectedId) ?? null;

  const filtered = statusFilter === 'all' ? queue : queue.filter(q => q.status === statusFilter);

  /* ---- Action Handlers ---- */

  const handleReview = (id: string) => {
    setQueue(prev => prev.map(q => q.id === id ? { ...q, status: 'reviewed' as const } : q));
    addToast({ severity: 'success', title: 'Marked as Reviewed', message: `${id} status updated to reviewed` });
  };

  const handleEscalate = (id: string) => {
    setQueue(prev => prev.map(q => q.id === id ? { ...q, status: 'escalated' as const } : q));
    addToast({ severity: 'warning', title: 'Escalated', message: `${id} has been escalated for priority review` });
  };

  const handleDismiss = (id: string) => {
    setQueue(prev => prev.map(q => q.id === id ? { ...q, status: 'dismissed' as const } : q));
    addToast({ severity: 'info', title: 'Dismissed', message: `${id} has been dismissed` });
  };

  const handleRunAiOrNot = (id: string) => {
    setRunningAiOrNot(id);
    setTimeout(() => {
      const result: AIorNotResult = {
        isAiGenerated: Math.random() > 0.5,
        confidence: 0.78 + Math.random() * 0.2,
        model: 'AIorNot v3.2',
        checkedAt: new Date().toISOString(),
      };
      setQueue(prev => prev.map(q => q.id === id ? { ...q, aiOrNot: result } : q));
      setRunningAiOrNot(null);
      addToast({
        severity: 'success',
        title: 'AIorNot Check Complete',
        message: `${id}: ${result.isAiGenerated ? 'AI-Generated' : 'Authentic'} (${(result.confidence * 100).toFixed(0)}% confidence)`,
      });
    }, 2200);
  };

  const handleRequestLlm = (id: string, provider: string) => {
    setRunningLlm(id);
    const providerModels: Record<string, string> = {
      Claude: 'Claude 3.5 Sonnet',
      ChatGPT: 'GPT-4o',
      DeepSeek: 'DeepSeek-V3',
      OpenRouter: 'Mixtral 8x22B',
    };
    setTimeout(() => {
      const assessments: Array<LlmAnalysisResult['riskAssessment']> = ['critical', 'high', 'medium', 'low'];
      const item = queue.find(q => q.id === id);
      const riskIdx = item && item.scores.csamRisk >= 0.8 ? 0 : item && item.scores.csamRisk >= 0.6 ? 1 : item && item.scores.csamRisk >= 0.4 ? 2 : 3;
      const result: LlmAnalysisResult = {
        provider,
        model: providerModels[provider] ?? provider,
        riskAssessment: assessments[riskIdx],
        suggestedAction: riskIdx <= 1
          ? 'Escalate to senior analyst and prepare NCMEC report documentation'
          : 'Standard review sufficient; no immediate escalation required',
        reasoning: `Analysis performed on hash metadata and classifier scores. Combined risk vector analysis yields ${assessments[riskIdx]} assessment. CSAM risk score of ${item?.scores.csamRisk.toFixed(2) ?? 'N/A'} with age estimation ${item?.scores.ageEstimation.toFixed(2) ?? 'N/A'} ${riskIdx <= 1 ? 'exceeds escalation threshold. Immediate supervisory review recommended.' : 'falls within acceptable parameters for standard review pipeline.'}`,
      };
      setQueue(prev => prev.map(q => q.id === id ? { ...q, llmAnalysis: result } : q));
      setRunningLlm(null);
      addToast({
        severity: 'success',
        title: 'LLM Analysis Complete',
        message: `${id}: ${provider} assessed risk as ${result.riskAssessment.toUpperCase()}`,
      });
    }, 3000);
  };

  const handleRunLocalAnalysis = (id: string) => {
    setRunningLocalAnalysis(id);
    const item = queue.find(q => q.id === id);
    const s = item?.scores ?? { nsfw: 0, nsfl: 0, csamRisk: 0, ageEstimation: 0, scene: 0 };
    setTimeout(() => {
      const result: LocalAnalysisResult = {
        models: [
          { modelId: 'nsfw_detector_v3', modelName: 'Internal NSFW v3', version: '3.2.1', modelType: 'onnx', task: 'nsfw_detection', primaryScore: s.nsfw, categories: { explicit_sexual: s.nsfw, suggestive: Math.max(0, s.nsfw - 0.08), violence_graphic: Math.min(s.nsfl, 0.15), violence_mild: Math.min(s.nsfl * 0.3, 0.08), drugs: 0.01, safe: Math.max(0, 1 - s.nsfw - 0.05) }, processingTimeMs: 10 + Math.floor(Math.random() * 5), inputSize: '224x224', preprocessing: 'imagenet', device: 'cuda' },
          { modelId: 'yahoo_open_nsfw', modelName: 'Yahoo Open NSFW', version: '1.1.0', modelType: 'onnx', task: 'nsfw_detection', primaryScore: Math.max(0, s.nsfw - 0.03 + (Math.random() * 0.06 - 0.03)), categories: { nsfw: Math.max(0, s.nsfw - 0.03), sfw: Math.max(0, 1 - s.nsfw + 0.03) }, processingTimeMs: 7 + Math.floor(Math.random() * 4), inputSize: '224x224', preprocessing: 'caffe', device: 'cuda' },
          { modelId: 'nudenet_v3', modelName: 'NudeNet v3', version: '3.4.0', modelType: 'onnx', task: 'nsfw_detection', primaryScore: Math.max(0, s.nsfw + 0.02 - Math.random() * 0.06), categories: { female_breast_exposed: Math.max(0, s.nsfw * 0.8), safe: Math.max(0, 1 - s.nsfw), belly_exposed: s.nsfw * 0.1, face_female: 0.02 }, processingTimeMs: 15 + Math.floor(Math.random() * 6), inputSize: '320x320', preprocessing: 'raw_0_1', device: 'cuda' },
          { modelId: 'nsfl_detector_v1', modelName: 'NSFL Detector', version: '1.0.2', modelType: 'onnx', task: 'nsfl_detection', primaryScore: s.nsfl, categories: { gore: s.nsfl * 0.7, violence_graphic: s.nsfl * 0.9, shock: s.nsfl * 0.4, disturbing: s.nsfl * 0.5, safe: Math.max(0, 1 - s.nsfl - 0.05) }, processingTimeMs: 12 + Math.floor(Math.random() * 5), inputSize: '224x224', preprocessing: 'imagenet', device: 'cuda' },
          { modelId: 'age_estimator_v2', modelName: 'Age Estimator', version: '2.3.0', modelType: 'onnx', task: 'age_estimation', primaryScore: s.ageEstimation, categories: { child: s.ageEstimation > 0.5 ? s.ageEstimation : 0.05, adolescent: s.ageEstimation > 0.3 && s.ageEstimation <= 0.5 ? s.ageEstimation : 0.08, adult: s.ageEstimation <= 0.3 ? 0.7 : 0.05, elderly: 0.02 }, processingTimeMs: 8 + Math.floor(Math.random() * 4), inputSize: '224x224', preprocessing: 'imagenet', device: 'cuda' },
          { modelId: 'scene_classifier_v1', modelName: 'Scene Classifier', version: '1.2.0', modelType: 'onnx', task: 'scene_classification', primaryScore: s.scene, categories: { indoor_residential: s.scene > 0.4 ? s.scene : 0.15, online_platform: 0.20, indoor_commercial: 0.12, outdoor: s.scene > 0.5 ? 0.08 : 0.35, ambiguous: 0.08 }, processingTimeMs: 20 + Math.floor(Math.random() * 6), inputSize: '299x299', preprocessing: 'imagenet', device: 'cuda' },
        ],
        totalTimeMs: 72 + Math.floor(Math.random() * 30),
        device: 'CUDA (NVIDIA A10G)',
        analyzedAt: new Date().toISOString(),
        pipelineVersion: '2.1.0',
      };
      setQueue(prev => prev.map(q => q.id === id ? { ...q, localAnalysis: result } : q));
      setRunningLocalAnalysis(null);
      addToast({
        severity: 'success',
        title: 'Local Analysis Complete',
        message: `${id}: 6 models completed in ${result.totalTimeMs}ms (${result.device})`,
      });
    }, 2500);
  };

  const handleSubmitContent = (mode: string) => {
    setIsSubmitting(true);
    setTimeout(() => {
      const newId = `H-${90700 + Math.floor(Math.random() * 100)}`;
      const newItem: ContentItem = {
        id: newId,
        hashPrefix: Array.from({ length: 6 }, () => Math.floor(Math.random() * 16).toString(16)).join('') + '...' + Array.from({ length: 4 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
        hashType: mode === 'hash' ? submitHashType : 'SHA-256',
        classifier: 'Pending',
        score: 0,
        status: 'pending_review',
        source: mode === 'upload' ? 'File Upload' : mode === 'url' ? 'URL Analysis' : 'Manual Hash',
        time: 'Just now',
        scores: { nsfw: 0, nsfl: 0, csamRisk: 0, ageEstimation: 0, scene: 0 },
        aiOrNot: null,
        llmAnalysis: null,
        ensembleDetails: null,
        localAnalysis: null,
      };
      setQueue(prev => [newItem, ...prev]);
      setIsSubmitting(false);
      setShowSubmitPanel(false);
      setSubmitUrl('');
      setSubmitHash('');
      addToast({ severity: 'success', title: 'Content Submitted', message: `${newId} added to review queue. Classifiers running...` });
    }, 1500);
  };

  /* ---- Stats ---- */

  const pendingCount = queue.filter(q => q.status === 'pending_review').length;
  const escalatedCount = queue.filter(q => q.status === 'escalated').length;
  const reviewedCount = queue.filter(q => q.status === 'reviewed').length;
  const hashMatchCount = queue.filter(q => q.source.includes('Match')).length;

  /* ---- Score bar renderer ---- */

  const renderScoreBar = (label: string, value: number) => (
    <div key={label} className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className={`font-mono font-semibold ${scoreTextColor(value)}`}>{value.toFixed(2)}</span>
      </div>
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${scoreBarColor(value)}`}
          style={{ width: `${Math.min(value * 100, 100)}%` }}
        />
      </div>
    </div>
  );

  /* ---- Detail Panel ---- */

  const renderDetailPanel = () => {
    if (!selectedItem) return null;

    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col h-full">
        {/* Panel Header */}
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-mono text-teal-400 font-semibold text-sm">{selectedItem.id}</span>
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${statusStyle[selectedItem.status]}`}>
              {statusLabel[selectedItem.status]}
            </span>
          </div>
          <button
            onClick={() => setSelectedId(null)}
            className="text-slate-500 hover:text-slate-300 transition-colors shrink-0"
            aria-label="Close detail panel"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Panel Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Hash Info */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Hash Information</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-slate-500 text-xs">Prefix</span>
                <p className="font-mono text-slate-300 text-xs mt-0.5">{selectedItem.hashPrefix}</p>
              </div>
              <div>
                <span className="text-slate-500 text-xs">Type</span>
                <p className="text-slate-300 text-xs mt-0.5">{selectedItem.hashType}</p>
              </div>
              <div>
                <span className="text-slate-500 text-xs">Source</span>
                <p className="text-slate-300 text-xs mt-0.5">{selectedItem.source}</p>
              </div>
              <div>
                <span className="text-slate-500 text-xs">Detected</span>
                <p className="text-slate-300 text-xs mt-0.5">{selectedItem.time}</p>
              </div>
            </div>
          </div>

          {/* AI Classification Scores */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">AI Classification Scores</h3>
            <div className="space-y-2.5">
              {renderScoreBar('NSFW', selectedItem.scores.nsfw)}
              {renderScoreBar('NSFL', selectedItem.scores.nsfl)}
              {renderScoreBar('CSAM Risk', selectedItem.scores.csamRisk)}
              {renderScoreBar('Age Estimation', selectedItem.scores.ageEstimation)}
              {renderScoreBar('Scene', selectedItem.scores.scene)}
            </div>
          </div>

          {/* Local Model Analysis */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Local Model Analysis</h3>
              {selectedItem.localAnalysis && (
                <span className="text-[10px] text-slate-600 font-mono">{selectedItem.localAnalysis.device}</span>
              )}
            </div>
            {selectedItem.localAnalysis ? (
              <div className="space-y-2">
                {/* Pipeline summary bar */}
                <div className="bg-slate-800/50 rounded-lg p-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-3 text-[10px]">
                    <span className="text-slate-500">Pipeline <span className="text-slate-400 font-mono">v{selectedItem.localAnalysis.pipelineVersion}</span></span>
                    <span className="text-slate-500">{selectedItem.localAnalysis.models.length} models</span>
                    <span className="text-slate-500">Total: <span className="text-cyan-400 font-mono">{selectedItem.localAnalysis.totalTimeMs}ms</span></span>
                  </div>
                  <span className="text-[10px] text-slate-600">{new Date(selectedItem.localAnalysis.analyzedAt).toLocaleString()}</span>
                </div>

                {/* Models grouped by task */}
                {(['nsfw_detection', 'nsfl_detection', 'age_estimation', 'scene_classification'] as const).map(task => {
                  const taskModels = selectedItem.localAnalysis!.models.filter(m => m.task === task);
                  if (taskModels.length === 0) return null;
                  const taskLabels: Record<string, { label: string; color: string }> = {
                    nsfw_detection: { label: 'NSFW Detection', color: 'text-red-400' },
                    nsfl_detection: { label: 'NSFL Detection', color: 'text-orange-400' },
                    age_estimation: { label: 'Age Estimation', color: 'text-blue-400' },
                    scene_classification: { label: 'Scene Classification', color: 'text-emerald-400' },
                  };
                  const tl = taskLabels[task];
                  return (
                    <div key={task}>
                      <span className={`text-[10px] font-semibold uppercase tracking-wider ${tl.color}`}>{tl.label}</span>
                      <div className="space-y-1.5 mt-1">
                        {taskModels.map(model => (
                          <div key={model.modelId} className="bg-slate-800/40 rounded-lg p-2.5">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-slate-300">{model.modelName}</span>
                                <span className="text-[10px] text-slate-600 font-mono">v{model.version}</span>
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 uppercase font-mono">{model.modelType}</span>
                              </div>
                              <span className="text-[10px] text-slate-500 font-mono">{model.processingTimeMs}ms</span>
                            </div>
                            {/* Score bar */}
                            <div className="flex items-center gap-2 mb-1.5">
                              <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    model.primaryScore >= 0.8 ? 'bg-red-500' :
                                    model.primaryScore >= 0.5 ? 'bg-amber-500' : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${Math.min(model.primaryScore * 100, 100)}%` }}
                                />
                              </div>
                              <span className={`text-xs font-mono font-semibold w-12 text-right ${
                                model.primaryScore >= 0.8 ? 'text-red-400' :
                                model.primaryScore >= 0.5 ? 'text-amber-400' : 'text-emerald-400'
                              }`}>{(model.primaryScore * 100).toFixed(0)}%</span>
                            </div>
                            {/* Category breakdown */}
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(model.categories)
                                .sort(([, a], [, b]) => b - a)
                                .slice(0, 4)
                                .map(([cat, score]) => (
                                  <span key={cat} className="text-[10px] text-slate-500 bg-slate-700/40 px-1.5 py-0.5 rounded">
                                    {cat.replace(/_/g, ' ')}: {(score * 100).toFixed(0)}%
                                  </span>
                                ))}
                            </div>
                            {/* Technical details */}
                            <div className="flex gap-3 mt-1.5 text-[9px] text-slate-600">
                              <span>Input: {model.inputSize}</span>
                              <span>Preprocess: {model.preprocessing}</span>
                              <span>Device: {model.device.toUpperCase()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-slate-800/30 rounded-lg p-3 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-500">Not analyzed</span>
                  <p className="text-[10px] text-slate-600 mt-0.5">Run 6 local ONNX models (NSFW, NSFL, Age, Scene)</p>
                </div>
                <button
                  onClick={() => handleRunLocalAnalysis(selectedItem.id)}
                  disabled={runningLocalAnalysis === selectedItem.id}
                  className="text-xs text-cyan-400 hover:text-cyan-300 px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {runningLocalAnalysis === selectedItem.id && (
                    <span className="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                  )}
                  {runningLocalAnalysis === selectedItem.id ? 'Running Pipeline...' : 'Run Local Analysis'}
                </button>
              </div>
            )}
          </div>

          {/* AIorNot Detection */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">AIorNot Detection</h3>
            {selectedItem.aiOrNot ? (
              <div className="bg-slate-800/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">AI Generated</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${selectedItem.aiOrNot.isAiGenerated ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                    {selectedItem.aiOrNot.isAiGenerated ? 'YES' : 'NO'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Confidence</span>
                  <span className="text-xs font-mono text-slate-300">{(selectedItem.aiOrNot.confidence * 100).toFixed(1)}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Model</span>
                  <span className="text-xs text-slate-300">{selectedItem.aiOrNot.model}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Checked</span>
                  <span className="text-xs text-slate-500">{new Date(selectedItem.aiOrNot.checkedAt).toLocaleString()}</span>
                </div>
              </div>
            ) : (
              <div className="bg-slate-800/30 rounded-lg p-3 flex items-center justify-between">
                <span className="text-xs text-slate-500">Not checked</span>
                <button
                  onClick={() => handleRunAiOrNot(selectedItem.id)}
                  disabled={runningAiOrNot === selectedItem.id}
                  className="text-xs text-teal-400 hover:text-teal-300 px-3 py-1.5 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {runningAiOrNot === selectedItem.id && (
                    <span className="w-3 h-3 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
                  )}
                  {runningAiOrNot === selectedItem.id ? 'Analyzing...' : 'Run AIorNot Check'}
                </button>
              </div>
            )}
          </div>

          {/* LLM Analysis */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">LLM Analysis</h3>
            {selectedItem.llmAnalysis ? (
              <div className="bg-slate-800/50 rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{selectedItem.llmAnalysis.provider}</span>
                    <span className="text-[10px] text-slate-500 font-mono">{selectedItem.llmAnalysis.model}</span>
                  </div>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${riskBadgeStyle[selectedItem.llmAnalysis.riskAssessment]}`}>
                    {selectedItem.llmAnalysis.riskAssessment}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500">Suggested Action</span>
                  <p className="text-xs text-slate-200 mt-1">{selectedItem.llmAnalysis.suggestedAction}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-500">Reasoning</span>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">{selectedItem.llmAnalysis.reasoning}</p>
                </div>
              </div>
            ) : (
              <div className="bg-slate-800/30 rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">No analysis performed</span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={llmProvider}
                    onChange={(e) => setLlmProvider(e.target.value)}
                    className="flex-1 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-purple-500"
                  >
                    <option value="Claude">Claude (Anthropic)</option>
                    <option value="ChatGPT">ChatGPT (OpenAI)</option>
                    <option value="DeepSeek">DeepSeek</option>
                    <option value="OpenRouter">OpenRouter</option>
                  </select>
                  <button
                    onClick={() => handleRequestLlm(selectedItem.id, llmProvider)}
                    disabled={runningLlm === selectedItem.id}
                    className="text-xs text-purple-400 hover:text-purple-300 px-3 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex items-center gap-1.5"
                  >
                    {runningLlm === selectedItem.id && (
                      <span className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                    )}
                    {runningLlm === selectedItem.id ? 'Analyzing...' : 'Request AI Analysis'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Model Comparison */}
          {selectedItem.ensembleDetails && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Model Comparison</h3>
              <div className="bg-slate-800/30 rounded-lg p-3 space-y-3">
                {/* Ensemble method & agreement */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">Ensemble: {selectedItem.ensembleDetails.method.replace('_', ' ')}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500">Agreement</span>
                    <div className="w-20 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          selectedItem.ensembleDetails.agreement >= 0.8 ? 'bg-emerald-500' :
                          selectedItem.ensembleDetails.agreement >= 0.6 ? 'bg-amber-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${selectedItem.ensembleDetails.agreement * 100}%` }}
                      />
                    </div>
                    <span className={`text-xs font-mono font-medium ${
                      selectedItem.ensembleDetails.agreement >= 0.8 ? 'text-emerald-400' :
                      selectedItem.ensembleDetails.agreement >= 0.6 ? 'text-amber-400' : 'text-red-400'
                    }`}>
                      {(selectedItem.ensembleDetails.agreement * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>

                {/* Per-model scores */}
                <div className="space-y-2">
                  {selectedItem.ensembleDetails.modelScores.map((model) => (
                    <div key={model.modelId} className="bg-slate-800/50 rounded-lg p-2.5">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-slate-300">{model.modelName}</span>
                          <span className="text-[10px] text-slate-600">{model.version}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">{model.processingTimeMs}ms</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              model.score >= 0.8 ? 'bg-red-500' :
                              model.score >= 0.5 ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${model.score * 100}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono text-slate-300 w-12 text-right">{(model.score * 100).toFixed(0)}%</span>
                      </div>
                      {/* Top categories */}
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {Object.entries(model.categories)
                          .sort(([, a], [, b]) => b - a)
                          .slice(0, 3)
                          .map(([cat, score]) => (
                            <span key={cat} className="text-[10px] text-slate-500 bg-slate-700/50 px-1.5 py-0.5 rounded">
                              {cat.replace(/_/g, ' ')}: {(score * 100).toFixed(0)}%
                            </span>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</h3>
            <div className="flex flex-wrap gap-2">
              {selectedItem.status !== 'reviewed' && (
                <button
                  onClick={() => handleReview(selectedItem.id)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition-colors"
                >
                  Mark Reviewed
                </button>
              )}
              {selectedItem.status !== 'escalated' && (
                <button
                  onClick={() => handleEscalate(selectedItem.id)}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-medium transition-colors"
                >
                  Escalate
                </button>
              )}
              {selectedItem.status !== 'dismissed' && (
                <button
                  onClick={() => handleDismiss(selectedItem.id)}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs font-medium transition-colors"
                >
                  Dismiss
                </button>
              )}
              <button
                onClick={() => setLinkCaseModalOpen(true)}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-medium transition-colors"
              >
                Link to Case
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  /* ---- Render ---- */

  return (
    <div className="space-y-6">
      {/* Header + ZVE Banner */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Content Analysis</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSubmitPanel(!showSubmitPanel)}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-500 rounded-lg text-sm font-medium text-white transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Submit Content
          </button>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/30 rounded-lg">
            <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <span className="text-xs text-red-400 font-medium">Zero Visual Exposure Active — Raw content never displayed</span>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Pending Review', value: String(pendingCount), color: 'text-amber-400' },
          { label: 'Escalated', value: String(escalatedCount), color: 'text-red-400' },
          { label: 'Reviewed Today', value: String(reviewedCount), color: 'text-emerald-400' },
          { label: 'Hash Matches', value: String(hashMatchCount), color: 'text-purple-400' },
        ].map(s => (
          <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Content Submission Panel */}
      {showSubmitPanel && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="p-5 space-y-4">
            {/* Mode Tabs */}
            <div className="flex gap-2">
              {([
                { key: 'upload' as const, label: 'Upload', icon: 'M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5' },
                { key: 'url' as const, label: 'URL', icon: 'M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244' },
                { key: 'hash' as const, label: 'Hash', icon: 'M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5-3.9 19.5m-2.1-19.5-3.9 19.5' },
              ]).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setSubmitMode(tab.key)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                    submitMode === tab.key
                      ? 'bg-teal-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
                  </svg>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Upload Mode */}
            {submitMode === 'upload' && (
              <div className="space-y-3">
                <div
                  className="border-2 border-dashed border-slate-700 rounded-xl p-8 text-center hover:border-teal-500/50 transition-colors cursor-pointer"
                  onClick={() => document.getElementById('file-upload-input')?.click()}
                >
                  <svg className="w-10 h-10 text-slate-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                  </svg>
                  <p className="text-sm text-slate-400 mb-1">Drop files here or click to browse</p>
                  <p className="text-xs text-slate-600">Accepted: Images, videos, documents, archives</p>
                  <input id="file-upload-input" type="file" className="hidden" onChange={() => handleSubmitContent('upload')} />
                </div>
                <button
                  onClick={() => handleSubmitContent('upload')}
                  disabled={isSubmitting}
                  className="w-full px-4 py-2.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {isSubmitting && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {isSubmitting ? 'Processing...' : 'Upload & Analyze'}
                </button>
              </div>
            )}

            {/* URL Mode */}
            {submitMode === 'url' && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={submitUrl}
                    onChange={(e) => setSubmitUrl(e.target.value)}
                    placeholder="https://example.com/content-to-analyze"
                    className="flex-1 px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-teal-500 font-mono"
                  />
                  <button
                    onClick={() => handleSubmitContent('url')}
                    disabled={isSubmitting}
                    className="px-5 py-2.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap"
                  >
                    {isSubmitting && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                    {isSubmitting ? 'Analyzing...' : 'Analyze URL'}
                  </button>
                </div>
              </div>
            )}

            {/* Hash Mode */}
            {submitMode === 'hash' && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={submitHash}
                    onChange={(e) => setSubmitHash(e.target.value)}
                    placeholder="Enter content hash value..."
                    className="flex-1 px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-teal-500 font-mono"
                  />
                  <select
                    value={submitHashType}
                    onChange={(e) => setSubmitHashType(e.target.value)}
                    className="px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 focus:outline-none focus:border-teal-500"
                  >
                    <option value="SHA-256">SHA-256</option>
                    <option value="MD5">MD5</option>
                    <option value="PhotoDNA">PhotoDNA</option>
                    <option value="pHash">pHash</option>
                    <option value="PDQ">PDQ</option>
                  </select>
                  <button
                    onClick={() => handleSubmitContent('hash')}
                    disabled={isSubmitting}
                    className="px-5 py-2.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap"
                  >
                    {isSubmitting && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                    {isSubmitting ? 'Submitting...' : 'Submit Hash'}
                  </button>
                </div>
              </div>
            )}

            {/* ZVE Notice */}
            <div className="flex items-start gap-3 p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
              <svg className="w-4 h-4 text-red-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
              </svg>
              <p className="text-xs text-red-400/80 leading-relaxed">
                <span className="font-semibold text-red-400">Zero Visual Exposure:</span> Raw content is immediately hashed and discarded. Only hash values and metadata enter the analysis pipeline.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Status Filters */}
      <div className="flex gap-2">
        {([
          { key: 'all', label: 'All' },
          { key: 'pending_review', label: 'Pending Review' },
          { key: 'escalated', label: 'Escalated' },
          { key: 'reviewed', label: 'Reviewed' },
          { key: 'dismissed', label: 'Dismissed' },
        ] as const).map(f => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === f.key
                ? 'bg-purple-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {f.label}
            {f.key !== 'all' && (
              <span className="ml-1.5 text-[10px] opacity-70">
                {queue.filter(q => q.status === f.key).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Main Content: Table + Detail Panel */}
      <div className={`flex gap-4 ${selectedItem ? '' : ''}`}>
        {/* Table */}
        <div className={`${selectedItem ? 'w-[60%]' : 'w-full'} transition-all duration-300`}>
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-200">Review Queue</h2>
              <span className="text-xs text-slate-500">{filtered.length} items</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500 text-xs uppercase">
                    <th className="text-left px-4 py-3">ID</th>
                    <th className="text-left px-4 py-3">Hash</th>
                    <th className="text-left px-4 py-3">Classifier</th>
                    <th className="text-right px-4 py-3">Score</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Source</th>
                    <th className="text-left px-4 py-3">Time</th>
                    <th className="text-right px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filtered.map(q => (
                    <tr
                      key={q.id}
                      onClick={() => setSelectedId(q.id)}
                      className={`hover:bg-slate-800/50 transition-colors cursor-pointer ${
                        selectedId === q.id
                          ? 'bg-purple-500/10 border-l-2 border-l-purple-500'
                          : ''
                      }`}
                    >
                      <td className="px-4 py-3 font-mono text-teal-400 text-xs">{q.id}</td>
                      <td className="px-4 py-3 font-mono text-slate-400 text-xs">{q.hashPrefix}</td>
                      <td className="px-4 py-3 text-slate-300 text-xs">{q.classifier}</td>
                      <td className={`px-4 py-3 text-right font-mono text-xs ${scoreTextColor(q.score)}`}>
                        {q.score.toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${statusStyle[q.status]}`}>
                          {statusLabel[q.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{q.source}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{q.time}</td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {q.status === 'pending_review' && (
                            <button
                              onClick={() => handleReview(q.id)}
                              className="text-[10px] text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors"
                            >
                              Review
                            </button>
                          )}
                          {q.status !== 'escalated' && (
                            <button
                              onClick={() => handleEscalate(q.id)}
                              className="text-[10px] text-red-400 hover:text-red-300 px-2 py-1 rounded bg-red-500/10 hover:bg-red-500/20 transition-colors"
                            >
                              Escalate
                            </button>
                          )}
                          {q.status !== 'dismissed' && (
                            <button
                              onClick={() => handleDismiss(q.id)}
                              className="text-[10px] text-slate-400 hover:text-slate-300 px-2 py-1 rounded bg-slate-500/10 hover:bg-slate-500/20 transition-colors"
                            >
                              Dismiss
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-slate-500 text-sm">
                        {queue.length === 0
                          ? 'No content in the analysis queue. Submit content above to begin analysis.'
                          : 'No items match the selected filter'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Detail Panel */}
        {selectedItem && (
          <div className="w-[40%] transition-all duration-300">
            {renderDetailPanel()}
          </div>
        )}
      </div>

      {/* Link to Case Modal */}
      <Modal isOpen={linkCaseModalOpen} onClose={() => setLinkCaseModalOpen(false)} title="Link to Case" size="md">
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Link content hash <span className="font-mono text-teal-400">{selectedItem?.id}</span> to an existing case or create a new one.
          </p>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Case ID</label>
            <input
              type="text"
              placeholder="e.g., CS-2024-0891"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500 font-mono"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Notes</label>
            <textarea
              rows={3}
              placeholder="Additional context for the case linkage..."
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500 resize-none"
            />
          </div>
          <div className="flex gap-2 pt-4 border-t border-slate-800">
            <button
              onClick={() => {
                setLinkCaseModalOpen(false);
                addToast({ severity: 'success', title: 'Linked to Case', message: `${selectedItem?.id} has been linked to the case` });
              }}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Link to Case
            </button>
            <button
              onClick={() => setLinkCaseModalOpen(false)}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
