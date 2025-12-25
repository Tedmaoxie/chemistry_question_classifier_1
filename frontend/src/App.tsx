import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Container, Box, Typography, Paper, GridLegacy as Grid, Button, Slider, FormControlLabel, TextField, LinearProgress, Stack, Alert, Chip, Card, CardContent, Divider, Radio, RadioGroup, FormControl, FormLabel, Tooltip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Select, MenuItem, InputLabel, Accordion, AccordionSummary, AccordionDetails, CircularProgress, AppBar, Toolbar, Tabs, Tab } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import ScienceIcon from '@mui/icons-material/Science';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import InfoIcon from '@mui/icons-material/Info';
import DownloadIcon from '@mui/icons-material/Download';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import InsightsIcon from '@mui/icons-material/Insights';
import SaveIcon from '@mui/icons-material/Save';
import HistoryIcon from '@mui/icons-material/History';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

import { DifficultyMatrix } from './components/DifficultyMatrix';
import { DataVisualization } from './components/DataVisualization';
import { HistorySelector } from './components/HistorySelector';
import { Question, ModelConfig, ModelTaskStatus, RatingSession } from './types';
import { saveSessionToIndexedDB } from './utils/indexedDb';
import { extractAbilityCodes, getDifficultyChipProps, PROVIDER_NAMES } from './utils/helpers';

const DEFAULT_CONFIG: Omit<ModelConfig, 'id' | 'label'> = {
    provider: 'deepseek',
    apiKey: '',
    baseUrl: 'https://api.deepseek.com/v1',
    modelName: 'deepseek-chat',
    temperature: 0.3
};

const PROVIDER_DEFAULTS: Record<string, Partial<ModelConfig>> = {
    deepseek: { baseUrl: 'https://api.deepseek.com/v1', modelName: 'deepseek-chat' },
    doubao: { baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', modelName: 'ep-20251214202700-4jpcm' },
    qwen: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', modelName: 'qwen-plus' },
    kimi: { baseUrl: 'https://api.moonshot.cn/v1', modelName: 'kimi-k2-0905-preview' },
    zhipu: { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', modelName: 'GLM-4.5-X' }
};


// --- 子组件：模型结果折叠面板 ---
// 独立组件以管理展开/折叠状态，避免"controlled/uncontrolled"警告
const ModelResultAccordion = React.memo(({ 
    modelLabel, 
    displayName, 
    statusInfo, 
    result,
    id,
    highlighted,
    onRetry,
    questionId,
    expanded: expandedProp,
    onExpandedChange
}: { 
    modelLabel: string, 
    displayName: string, 
    statusInfo: ModelTaskStatus | undefined, 
    result: any,
    id: string,
    highlighted?: boolean,
    onRetry?: (questionId: string, modelLabel: string) => void,
    questionId: string,
    expanded?: boolean,
    onExpandedChange?: (id: string, isExpanded: boolean) => void
}) => {
    const [localExpanded, setLocalExpanded] = useState(false);
    const isControlled = expandedProp !== undefined;
    const expanded = isControlled ? expandedProp : localExpanded;

    const prevStatus = useRef(statusInfo?.status);
    const reportRef = useRef<HTMLDivElement>(null);
    const [downloading, setDownloading] = useState(false);

    useEffect(() => {
        const status = statusInfo?.status;
        // 状态从未完成变为处理中或完成时，自动展开
        if (status !== prevStatus.current) {
            if ((status === 'processing' || status === 'completed') && !expanded) {
                 if (isControlled) {
                     onExpandedChange?.(id, true);
                 } else {
                     setLocalExpanded(true);
                 }
            }
            prevStatus.current = status;
        }
    }, [statusInfo?.status, expanded, isControlled, onExpandedChange, id]);

    // 如果被高亮，自动展开
    useEffect(() => {
        if (highlighted && !expanded) {
            if (isControlled) {
                onExpandedChange?.(id, true);
            } else {
                setLocalExpanded(true);
            }
        }
    }, [highlighted, expanded, isControlled, onExpandedChange, id]);

    const handleChange = (_event: React.SyntheticEvent, isExpanded: boolean) => {
        if (isControlled) {
            onExpandedChange?.(id, isExpanded);
        } else {
            setLocalExpanded(isExpanded);
        }
    };

    const isCompletedStatus = statusInfo?.status === 'completed';
    const isProcessing = statusInfo?.status === 'processing';
    const isFailedStatus = statusInfo?.status === 'failed';
    const isPending = !statusInfo || statusInfo.status === 'pending';
    
    // Extract details if completed
    const isObject = typeof result === 'object' && result !== null;
    const finalLevelRaw = isObject ? (result.final_level || result.comprehensive_rating?.final_level) : "未知";
    const markdownReport = isObject ? result.markdown_report : String(result || "");
    const isDowngraded = isObject && result.is_downgraded === true;
    const elapsedTime = result?.elapsed_time;

    // Detect logical error (completed status but error result)
    // 逻辑错误判定：虽然状态为 completed，但返回结果中标记为 Error，或者是 JSON 解析失败的错误信息
    const isLogicalError = isCompletedStatus && (
        finalLevelRaw === 'Error' || 
        result?.level === 'Error' ||
        (typeof result === 'string' && result.includes('Failed to parse JSON')) // Handle raw string error
    );

    const isFailed = isFailedStatus || isLogicalError;
    const isCompleted = isCompletedStatus && !isLogicalError;
    
    const finalLevel = isFailed ? "Error" : finalLevelRaw;

    // 获取错误信息
    const errorMessage = isLogicalError 
        ? (result?.error || (typeof result === 'string' ? result : "未知错误")) 
        : (statusInfo?.error || "未知错误");

    const handleDownloadMD = () => {
        if (!markdownReport) return;
        const blob = new Blob([markdownReport], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${questionId || 'report'}_详细报告.md`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleDownloadPDF = async () => {
        if (!reportRef.current) return;
        setDownloading(true);
        try {
            const canvas = await html2canvas(reportRef.current, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                ignoreElements: (element) => element.classList.contains('no-print')
            });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const imgWidth = pdfWidth;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            
            let heightLeft = imgHeight;
            let position = 0;

            if (heightLeft <= pdfHeight) {
                pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
            } else {
                while (heightLeft > 0) {
                    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                    heightLeft -= pdfHeight;
                    position -= pdfHeight;
                    if (heightLeft > 0) {
                        pdf.addPage();
                    }
                }
            }
            pdf.save(`${questionId || 'report'}_详细报告.pdf`);
        } catch (error) {
            console.error('PDF generation failed', error);
        } finally {
            setDownloading(false);
        }
    };

    return (
        <Accordion 
            id={id}
            expanded={expanded} 
            onChange={handleChange}
            disabled={isPending} 
            variant="outlined" 
            TransitionProps={{ unmountOnExit: true }}
            sx={{ 
                mb: 1,
                backgroundColor: highlighted ? '#E3F2FD' : 'inherit',
                transition: 'background-color 0.3s ease-in-out',
                border: highlighted ? '1px solid #1565C0' : undefined
            }}
        >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack direction="row" alignItems="center" spacing={2} sx={{ width: '100%' }}>
                    <Typography sx={{ width: '15%', flexShrink: 0, fontWeight: 'bold' }}>
                        {displayName}
                    </Typography>
                    
                    {isProcessing && (
                        <Stack direction="row" spacing={1} alignItems="center">
                            <CircularProgress size={16} />
                            <Typography variant="caption" color="text.secondary">正在分析...</Typography>
                        </Stack>
                    )}
                    
                    {isCompleted && (
                        <>
                            <Chip 
                                label={`难度: ${finalLevel}`} 
                                {...getDifficultyChipProps(finalLevel)}
                                size="small" 
                            />
                            {isDowngraded && <Chip label="降级" color="warning" size="small" variant="outlined" />}
                            {elapsedTime && (
                                <Chip 
                                    icon={<AccessTimeIcon />}
                                    label={`${elapsedTime}s`} 
                                    size="small" 
                                    variant="outlined" 
                                />
                            )}
                        </>
                    )}
                    
                    {isFailed && (
                        <Stack direction="row" spacing={1} alignItems="center">
                            <Chip label="分析失败" color="error" size="small" />
                            <Button
                                variant="outlined"
                                color="error"
                                size="small"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onRetry && onRetry(questionId, modelLabel);
                                }}
                                startIcon={<RefreshIcon />}
                                sx={{ fontSize: '12px', padding: '2px 8px', minWidth: 'auto' }}
                            >
                                重新评定
                            </Button>
                        </Stack>
                    )}
                    
                    {isPending && (
                        <Typography variant="caption" color="text.secondary">等待中...</Typography>
                    )}
                </Stack>
            </AccordionSummary>
            <AccordionDetails>
                {isCompleted ? (
                    <Box ref={reportRef} sx={{ position: 'relative' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                            <Box sx={{ flex: 1 }}>
                                {isObject && result.meta?.framework_topic && (
                                    <Chip label={`框架主题: ${result.meta.framework_topic}`} size="small" color="secondary" variant="outlined" sx={{ mr: 1, mb: 1 }} />
                                )}
                                {isObject && result.meta?.knowledge_topic && (
                                    <Chip label={`考查内容: ${result.meta.knowledge_topic}`} size="small" sx={{ mr: 1, mb: 1 }} />
                                )}
                                {isObject && result.meta?.ability_elements && (
                                    <Chip label={`能力要素: ${extractAbilityCodes(result.meta.ability_elements)}`} size="small" sx={{ mb: 1 }} />
                                )}
                            </Box>
                            <Stack direction="row" spacing={1} className="no-print">
                                <Button 
                                    variant="outlined" 
                                    size="small" 
                                    startIcon={<DownloadIcon />} 
                                    onClick={handleDownloadMD}
                                    sx={{ minWidth: '90px' }}
                                >
                                    下载MD
                                </Button>
                                <Button 
                                    variant="outlined" 
                                    size="small" 
                                    startIcon={downloading ? <CircularProgress size={16} /> : <DownloadIcon />} 
                                    onClick={handleDownloadPDF}
                                    disabled={downloading}
                                    sx={{ minWidth: '90px' }}
                                >
                                    {downloading ? '生成中' : '下载PDF'}
                                </Button>
                            </Stack>
                        </Box>
                         <Divider sx={{ my: 1 }} />
                         <Typography variant="body2" component="div">
                             <ReactMarkdown>{markdownReport}</ReactMarkdown>
                         </Typography>
                    </Box>
                ) : isFailed ? (
                    <Box>
                        <Typography color="error" sx={{ mb: 2 }}>{errorMessage}</Typography>
                        <Button 
                            variant="outlined" 
                            color="primary" 
                            size="small" 
                            startIcon={<RefreshIcon />}
                            onClick={() => onRetry && onRetry(questionId, modelLabel)}
                        >
                            重新评定
                        </Button>
                    </Box>
                ) : (
                    <Typography color="text.secondary">正在生成分析报告...</Typography>
                )}
            </AccordionDetails>
        </Accordion>
    );
});

import { ScoreAnalysisView } from './components/ScoreAnalysisView';

function App() {
  // --- 状态管理 ---
  const [file, setFile] = useState<File | null>(null); // 当前选中的文件
  const [concurrency, setConcurrency] = useState(1); // 并发数量
  const [configs, setConfigs] = useState<ModelConfig[]>([
      { ...DEFAULT_CONFIG, id: 1, label: '并发1' }
  ]);
  
  const [uploadProgress, setUploadProgress] = useState(0); // 上传进度 (0-100)
  const [questions, setQuestions] = useState<Question[]>([]); // 题目列表
  const [error, setError] = useState<string | null>(null); // 错误信息
  const [uploading, setUploading] = useState(false); // 是否正在上传中
  const [analyzing, setAnalyzing] = useState(false); // 是否正在分析中
  const [progress, setProgress] = useState({ total: 0, completed: 0 }); // 分析总进度
  const [analysisMode, setAnalysisMode] = useState('sub_question'); // 分析模式：小题/整题
  const [taskIds, setTaskIds] = useState<string[]>([]); // 当前任务ID列表
  const [highlightedId, setHighlightedId] = useState<string | null>(null); // 高亮显示的分析结果ID
  const [expandedAccordions, setExpandedAccordions] = useState<Record<string, boolean>>({}); // 全局折叠状态管理

  const [analysisStartTime, setAnalysisStartTime] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [avgTimePerTask, setAvgTimePerTask] = useState<number>(0);

  // Update 'now' every second to refresh timer
  useEffect(() => {
      if (!analyzing) return;
      const timer = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(timer);
  }, [analyzing]);

  // Update average time per task when a task completes
  useEffect(() => {
      if (progress.completed > 0 && analysisStartTime) {
          // Use current time as the "completion time" for the latest batch
          // Note: This is an approximation. Ideally we'd use the timestamp of the last completion event.
          const elapsed = (Date.now() - analysisStartTime) / 1000;
          setAvgTimePerTask(elapsed / progress.completed);
      } else if (progress.completed === 0) {
          setAvgTimePerTask(0);
      }
  }, [progress.completed, analysisStartTime]);

  // Estimate remaining time
  const estimatedTimeRemaining = React.useMemo(() => {
      if (!analyzing || !analysisStartTime) return null;
      if (progress.completed === progress.total && progress.total > 0) return null;
      
      // Show "Calculating..." if no tasks are completed yet
      if (progress.completed === 0 || avgTimePerTask === 0) {
          return "计算中...";
      }
      
      // Calculate total expected duration based on fixed average time
      const totalExpectedDuration = avgTimePerTask * progress.total;
      const elapsedTotal = (now - analysisStartTime) / 1000;
      
      // Remaining time = Total Expected - Elapsed
      // This ensures the countdown decreases as 'now' increases
      const remainingSeconds = Math.max(0, Math.round(totalExpectedDuration - elapsedTotal));
      
      if (remainingSeconds < 60) return `${remainingSeconds}秒`;
      return `${Math.ceil(remainingSeconds / 60)}分钟`;
  }, [progress.total, progress.completed, analyzing, analysisStartTime, now, avgTimePerTask]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(''); // PDF导出状态
  const questionListRef = useRef<HTMLDivElement>(null); // 题目列表容器引用

  // --- Refs for stable handlers ---
  const questionsRef = useRef(questions);
  const configsRef = useRef(configs);
  
  useEffect(() => {
      questionsRef.current = questions;
  }, [questions]);
  
  useEffect(() => {
      configsRef.current = configs;
  }, [configs]);

  // --- History Feature State ---
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // --- 交互功能：全局折叠/展开 ---
  const handleAccordionChange = useCallback((id: string, isExpanded: boolean) => {
      setExpandedAccordions(prev => ({ ...prev, [id]: isExpanded }));
  }, []);

  const getAllAccordionIds = () => {
      return questions.flatMap(q => 
          configs.map(c => `analysis-${q.id}-${c.label}`)
      );
  };

  const isAllExpanded = () => {
      const ids = getAllAccordionIds();
      return ids.length > 0 && ids.every(id => expandedAccordions[id]);
  };

  const handleGlobalExpandCollapse = () => {
      const ids = getAllAccordionIds();
      const shouldExpand = !isAllExpanded();
      
      const newExpandedState = ids.reduce((acc, id) => {
          acc[id] = shouldExpand;
          return acc;
      }, {} as Record<string, boolean>);
      
      setExpandedAccordions(prev => ({ ...prev, ...newExpandedState }));
  };

  // --- 持久化存储 ---
  useEffect(() => {
      try {
          const savedConfigs = localStorage.getItem('llm_configs');
          if (savedConfigs) {
              const parsed = JSON.parse(savedConfigs);
              if (Array.isArray(parsed) && parsed.length > 0) {
                  setConfigs(parsed);
              }
          }
          const savedConcurrency = localStorage.getItem('llm_concurrency');
          if (savedConcurrency) {
              setConcurrency(parseInt(savedConcurrency, 10));
          }
      } catch (e) {
          console.error("Failed to load configs from localStorage", e);
      }
  }, []);

  useEffect(() => {
      localStorage.setItem('llm_configs', JSON.stringify(configs));
  }, [configs]);

  useEffect(() => {
      localStorage.setItem('llm_concurrency', concurrency.toString());
  }, [concurrency]);

  // 文件输入框的引用，用于重置
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- 事件处理：并发配置 ---
  // 仅更新 UI 数值，不触发昂贵的配置重构
  const handleConcurrencyChange = (_event: Event, newCount: number | number[]) => {
    setConcurrency(newCount as number);
  };

  // 拖动结束时才触发配置重构
  const handleConcurrencyChangeCommitted = (_event: React.SyntheticEvent | Event, newCount: number | number[]) => {
    const count = newCount as number;
    setConfigs(prev => {
        const newConfigs = [...prev];
        if (count > prev.length) {
            for (let i = prev.length + 1; i <= count; i++) {
                // Clone the first config's key/provider for convenience, or use default
                const baseConfig = prev[0] || DEFAULT_CONFIG;
                newConfigs.push({
                    ...baseConfig,
                    id: i,
                    label: `并发${i}`
                });
            }
        } else {
            newConfigs.splice(count);
        }
        return newConfigs;
    });
  };

  const handleConfigChange = (id: number, field: keyof ModelConfig, value: any) => {
      setConfigs(prev => prev.map(config => {
          if (config.id === id) {
              const newConfig = { ...config, [field]: value };
              // Auto-update defaults if provider changes
              if (field === 'provider' && PROVIDER_DEFAULTS[value as string]) {
                  const defaults = PROVIDER_DEFAULTS[value as string];
                  newConfig.baseUrl = defaults.baseUrl || '';
                  newConfig.modelName = defaults.modelName || '';
              }
              return newConfig;
          }
          return config;
      }));
  };

  // --- 交互功能：滚动定位 ---
  const handleScrollToAnalysis = (questionId: string, model: string) => {
    // 切换到第一个 Tab
    if (activeTab !== 0) {
        setActiveTab(0);
        // 延时等待 DOM 渲染完成后再滚动
        setTimeout(() => {
            const elementId = `analysis-${questionId}-${model}`;
            const element = document.getElementById(elementId);
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });
              setHighlightedId(elementId);
              setTimeout(() => setHighlightedId(null), 2000);
            }
        }, 100);
        return;
    }

    const elementId = `analysis-${questionId}-${model}`;
    const element = document.getElementById(elementId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedId(elementId);
      setTimeout(() => setHighlightedId(null), 2000);
    }
  };

  const [activeTab, setActiveTab] = useState(0);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  // --- 事件处理：文件选择 ---
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.files && event.target.files[0]) {
          const selectedFile = event.target.files[0];
          setFile(selectedFile);
          setQuestions([]); // 清空旧的题目列表
          setExpandedAccordions({}); // 清空展开状态
          setError(null);
          setUploadProgress(0);
          
          // 重置 input 值，允许重复上传同一个文件
          if (fileInputRef.current) {
              fileInputRef.current.value = '';
          }
      }
  };
  
  // --- 事件处理：文件拖拽 ---
  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer.files && event.dataTransfer.files[0]) {
          const selectedFile = event.dataTransfer.files[0];
          setFile(selectedFile);
          setQuestions([]);
          setExpandedAccordions({});
          setError(null);
          setUploadProgress(0);
      }
  };
  
  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
  };

  // --- 核心功能：上传文件并解析 ---
  const handleConfirmUpload = async () => {
      if (file) {
          await uploadFile(file);
      }
  };

  const uploadFile = async (fileToUpload: File) => {
      setUploading(true);
      setUploadProgress(0);
      setError(null);
      setQuestions([]); // 再次确保清空
      setExpandedAccordions({});
      
      const formData = new FormData();
      formData.append('file', fileToUpload);
      formData.append('mode', analysisMode); // 传递分析模式
      
      try {
          // 调用后端上传接口
          const response = await axios.post('/api/upload', formData, {
              headers: {
                  'Content-Type': 'multipart/form-data'
              },
              onUploadProgress: (progressEvent) => {
                  const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || fileToUpload.size));
                  setUploadProgress(percentCompleted);
              }
          });
          
          // 处理后端返回的题目列表
          if (Array.isArray(response.data)) {
               const initialQuestions = response.data.map((q: any) => ({ ...q, status: 'pending' }));
               setQuestions(initialQuestions);
               if (initialQuestions.length === 0) {
                   setError("未能识别出题目，请检查文件格式");
               }
          } else {
              throw new Error("Invalid response format");
          }

      } catch (err: any) {
          console.error(err);
          setError(err.response?.data?.detail || "Upload failed");
          setFile(null);
      } finally {
          setUploading(false);
      }
  };

  // --- 核心功能：重试分析 ---
  const handleRetry = useCallback(async (questionId: string, modelLabel: string) => {
      const question = questionsRef.current.find(q => q.id === questionId);
      const config = configsRef.current.find(c => c.label === modelLabel);
      
      if (!question || !config) return;

      // 立即更新状态为 processing，显示加载中
      setQuestions(prev => prev.map(q => {
          if (q.id === questionId) {
               return {
                   ...q,
                   modelStatus: {
                       ...q.modelStatus,
                       [modelLabel]: {
                           ...q.modelStatus?.[modelLabel],
                           status: 'processing',
                           error: undefined // 清除错误信息
                       } as ModelTaskStatus
                   }
               };
          }
          return q;
      }));

      try {
          // 构建配置 payload
          const configPayload = {
              provider: config.provider,
              api_key: config.apiKey,
              base_url: config.baseUrl || undefined,
              model_name: config.modelName || undefined,
              temperature: config.temperature,
              name_label: config.label
          };

          // 调用重试接口
          const response = await axios.post('/api/analyze/retry', {
              question: question,
              config: configPayload
          });

          const { task_id } = response.data;

          // 更新任务 ID 并开始轮询
          setQuestions(prev => prev.map(q => {
              if (q.id === questionId) {
                   return {
                       ...q,
                       modelStatus: {
                           ...q.modelStatus,
                           [modelLabel]: {
                               ...q.modelStatus?.[modelLabel],
                               status: 'processing',
                               taskId: task_id,
                               startTime: Date.now()
                           } as ModelTaskStatus
                       }
                   };
              }
              return q;
          }));

          // 添加到任务列表以便停止
          setTaskIds(prev => [...prev, task_id]);

          // 开始轮询该任务
          pollTasks([{ qId: questionId, model: modelLabel, taskId: task_id }]);

      } catch (err: any) {
          console.error("Retry failed", err);
          // 恢复为失败状态并显示错误
          setQuestions(prev => prev.map(q => {
              if (q.id === questionId) {
                   return {
                       ...q,
                       modelStatus: {
                           ...q.modelStatus,
                           [modelLabel]: {
                               ...q.modelStatus?.[modelLabel],
                               status: 'failed',
                               error: err.response?.data?.detail || "重试请求失败"
                           } as ModelTaskStatus
                       }
                   };
              }
              return q;
          }));
      }
  }, []);

  // --- 核心功能：开始分析 ---
  const startAnalysis = async () => {
      // Validate configs
      const missingKeys = configs.some(c => !c.apiKey);
      if (missingKeys) {
          setError("请完善所有开启并发的 API Key 配置");
          return;
      }

      setAnalyzing(true);
      setProgress({ total: questions.length, completed: 0 });
      setAnalysisStartTime(Date.now()); // Set start time
      
      try {
          // 1. 启动分析任务
          // Map frontend config to backend schema
          const payloadConfigs = configs.map(c => ({
              provider: c.provider,
              api_key: c.apiKey,
              base_url: c.baseUrl || undefined,
              model_name: c.modelName || undefined,
              temperature: c.temperature,
              name_label: c.label // Pass label to backend to use as result key
          }));

          const response = await axios.post('/api/analyze', {
              questions: questions,
              configs: payloadConfigs
          });
          
          // 2. 初始化任务状态
          const newQuestions = [...questions];
          const allTasks: { qId: string, model: string, taskId: string }[] = [];
          
          response.data.tasks.forEach((t: any) => {
              const qIndex = newQuestions.findIndex(q => q.id === t.question_id);
              if (qIndex !== -1) {
                  const modelStatus: Record<string, ModelTaskStatus> = {};
                  Object.entries(t.model_tasks).forEach(([model, taskId]) => {
                      modelStatus[model] = {
                          status: 'processing',
                          taskId: taskId as string,
                          startTime: Date.now()
                      };
                      allTasks.push({ qId: t.question_id, model, taskId: taskId as string });
                  });
                  
                  newQuestions[qIndex] = {
                      ...newQuestions[qIndex],
                      status: 'processing',
                      modelStatus,
                      analysis: {} // Reset analysis
                  };
              }
          });
          
          setQuestions(newQuestions);
          setTaskIds(allTasks.map(t => t.taskId));
          
          // 3. 轮询任务状态
          pollTasks(allTasks);

      } catch (err: any) {
          console.error(err);
          // 处理后端返回的详细错误信息
          let errorMessage = "启动分析失败";
          if (err.response && err.response.data) {
              if (err.response.data.detail) {
                  if (Array.isArray(err.response.data.detail)) {
                      // 验证错误通常返回一个列表
                      errorMessage = err.response.data.detail.map((e: any) => e.msg).join(", ");
                  } else {
                      errorMessage = err.response.data.detail;
                  }
              }
          }
          setError(errorMessage);
          setAnalyzing(false);
      }
  };

    // --- 辅助功能：轮询任务结果 ---
    const pollTasks = async (pendingTasks: { qId: string, model: string, taskId: string }[]) => {
      if (pendingTasks.length === 0) {
          setAnalyzing(false);
          return;
      }

      const remainingTasks: { qId: string, model: string, taskId: string }[] = [];
      const updates: Record<string, { modelStatus: Record<string, ModelTaskStatus>, analysis: Record<string, any> }> = {};
      let newlyCompletedTasks = 0;

      // Use batch status check
      try {
          const taskIds = pendingTasks.map(t => t.taskId);
          const res = await axios.post('/api/tasks/status', taskIds);
          const taskResults = res.data; // Record<string, any>

          pendingTasks.forEach(task => {
              const data = taskResults[task.taskId];
              if (!data) {
                  remainingTasks.push(task);
                  return;
              }

              const status = data.status;

              if (status === 'SUCCESS' || status === 'FAILURE' || status === 'REVOKED') {
                  // Initialize update object for this question if not exists
                  if (!updates[task.qId]) {
                      updates[task.qId] = { modelStatus: {}, analysis: {} };
                  }
                  
                  const endTime = Date.now();
                  // Update model status
                  updates[task.qId].modelStatus[task.model] = {
                      status: status === 'SUCCESS' ? 'completed' : 'failed',
                      taskId: task.taskId,
                      result: data.result, // Contains full result including elapsed_time
                      error: data.error || (status === 'REVOKED' ? "任务已终止" : undefined),
                      endTime: endTime
                  };

                  // Update analysis result
                  if (status === 'SUCCESS') {
                      updates[task.qId].analysis[task.model] = data.result.result; 
                  } else if (status === 'FAILURE') {
                      console.error(`Task failed for ${task.model}:`, data.error);
                  }
                  
                  newlyCompletedTasks++;
              } else {
                  remainingTasks.push(task);
              }
          });

      } catch (e) {
          console.error("Error polling tasks batch", e);
          // If batch fails, retry all
          remainingTasks.push(...pendingTasks);
      }

      // Apply updates to state
      if (Object.keys(updates).length > 0) {
          setQuestions(prev => prev.map(q => {
              if (updates[q.id]) {
                  const newModelStatus = { ...q.modelStatus, ...updates[q.id].modelStatus };
                  const newAnalysis = { ...q.analysis, ...updates[q.id].analysis };
                  
                  const allModels = Object.keys(newModelStatus);
                  const allDone = allModels.every(m => 
                      newModelStatus[m].status === 'completed' || newModelStatus[m].status === 'failed'
                  );
                  
                  const newStatus = allDone ? 'completed' : 'processing';
                  
                  return {
                      ...q,
                      modelStatus: newModelStatus,
                      analysis: newAnalysis,
                      status: newStatus
                  };
              }
              return q;
          }));
      }

      // Update progress bar based on questions completed
      setQuestions(prev => {
          const completedCount = prev.filter(q => q.status === 'completed').length;
          setProgress({ total: prev.length, completed: completedCount });
          return prev;
      });

      if (remainingTasks.length > 0) {
          setTimeout(() => pollTasks(remainingTasks), 2000);
      } else {
          setAnalyzing(false);
          setProgress(prev => ({ ...prev, completed: prev.total }));
      }
  };

  const handleStop = async () => {
      if (taskIds.length === 0) return;
      try {
          await axios.post('/api/tasks/stop', taskIds);
          // 立即重置前端状态
          setAnalyzing(false);
          setTaskIds([]);
          
          // 更新所有 pending/processing 状态的题目为 'failed' (用户终止)
          setQuestions(prev => prev.map(q => {
              const newModelStatus = { ...q.modelStatus };
              let changed = false;
              
              if (newModelStatus) {
                  Object.keys(newModelStatus).forEach(key => {
                      if (newModelStatus[key].status === 'processing' || newModelStatus[key].status === 'pending') {
                          newModelStatus[key] = {
                              ...newModelStatus[key],
                              status: 'failed',
                              error: '用户终止'
                          };
                          changed = true;
                      }
                  });
              }

              if (q.status === 'pending' || q.status === 'processing') {
                  return { 
                      ...q, 
                      status: 'failed', 
                      modelStatus: changed ? newModelStatus : q.modelStatus,
                      analysis: { ...q.analysis, error: '用户终止' } 
                  };
              }
              return q;
          }));

      } catch (err) {
          console.error("Stop failed", err);
          setError("停止任务失败");
      }
  };

  // --- 辅助功能：提取能力要素代码 ---
  // Moved outside component to avoid re-creation
  // const extractAbilityCodes = ...

  // --- 辅助功能：获取难度等级颜色配置 ---
  // Moved outside component to avoid re-creation
  // const getDifficultyChipProps = ...

  // --- 辅助功能：获取模型显示名称 ---
  const getModelDisplayName = (modelKey: string) => {
      // 1. 尝试通过 label 匹配配置
      const config = configs.find(c => c.label === modelKey);
      if (config) {
          return PROVIDER_NAMES[config.provider] || config.provider;
      }
      // 2. 如果 key 本身就是 provider key (兼容旧数据或单模型情况)
      if (PROVIDER_NAMES[modelKey]) {
          return PROVIDER_NAMES[modelKey];
      }
      // 3. 默认返回 key
      return modelKey;
  };



  // --- 导出 CSV ---
  const exportToCSV = () => {
      const headers = ["题目编号", "大模型名称", "难度评级", "框架知识主题", "核心知识主题", "能力要素"];
      const rows: string[] = [];
      rows.push(headers.join(","));

      questions.forEach(q => {
          if (q.status === 'completed' && q.analysis) {
              Object.keys(q.analysis).forEach(model => {
                  const result = q.analysis![model];
                  const isObject = typeof result === 'object' && result !== null;
                  const finalLevel = isObject ? (result.final_level || result.comprehensive_rating?.final_level) : "未知";
                  const knowledgeTopic = (isObject && result.meta?.knowledge_topic) ? result.meta.knowledge_topic : (q.preview || "");
                  const frameworkTopic = (isObject && result.meta?.framework_topic) ? result.meta.framework_topic : "未知";
                  const abilityCodes = isObject ? extractAbilityCodes(result.meta?.ability_elements) : "无";

                  // Handle comma in content to avoid CSV break
                  const safeKnowledgeTopic = knowledgeTopic.replace(/"/g, '""').replace(/\n/g, " "); 
                  
                  rows.push(`"${q.id}","${getModelDisplayName(model)}","${finalLevel}","${frameworkTopic}","${safeKnowledgeTopic}","${abilityCodes}"`);
              });
          }
      });

      const csvContent = "\uFEFF" + rows.join("\n"); // Add BOM for Excel utf-8 compatibility
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", "difficulty_summary.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  // --- 导出 PDF ---
  const exportToPDF = async () => {
      const input = document.getElementById('summary-table');
      if (!input) return;

      try {
          // Use html2canvas to capture the table
          // Note: If table is scrollable, we might need to handle height. 
          // For now, we capture the visible part or the whole table element if possible.
          const canvas = await html2canvas(input, {
              scale: 2, // Improve quality
              useCORS: true,
              logging: false
          });
          
          const imgData = canvas.toDataURL('image/png');
          const pdf = new jsPDF('p', 'mm', 'a4');
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = pdf.internal.pageSize.getHeight();
          const imgWidth = pdfWidth;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;
          
          let heightLeft = imgHeight;
          let position = 0;

          // Simple single page handling for now, or basic multi-page if height > page
          // If image is taller than page, we can slice it.
          
          if (heightLeft <= pdfHeight) {
              pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
          } else {
             // Multi-page logic (simplified)
             while (heightLeft > 0) {
                 pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                 heightLeft -= pdfHeight;
                 position -= pdfHeight;
                 if (heightLeft > 0) {
                     pdf.addPage();
                 }
             }
          }

          pdf.save("difficulty_summary.pdf");
      } catch (err) {
          console.error("PDF export failed", err);
          setError("导出 PDF 失败");
      }
  };

  const handleExportSummaryMD = () => {
    let mdContent = "# 高中化学试题深度标定与学情诊断汇总报告\n\n";
    mdContent += `生成时间: ${new Date().toLocaleString()}\n\n`;
    
    questions.forEach(q => {
        mdContent += `---\n\n# 题目ID: ${q.id}\n\n`;
        mdContent += `**题目内容预览**: ${q.preview}\n\n`;
        
        configs.forEach(config => {
            const modelLabel = config.label;
            const result = q.analysis?.[modelLabel];
            if (result) {
                const displayName = getModelDisplayName(modelLabel);
                mdContent += `## 模型: ${displayName}\n\n`;
                
                if (typeof result === 'object') {
                    const finalLevel = result.final_level || result.comprehensive_rating?.final_level || "未知";
                    mdContent += `**难度评级**: ${finalLevel}\n\n`;
                    if (result.meta) {
                         mdContent += `**框架主题**: ${result.meta.framework_topic || '-'}\n`;
                         mdContent += `**知识点**: ${result.meta.knowledge_topic || '-'}\n`;
                         mdContent += `**能力要素**: ${extractAbilityCodes(result.meta.ability_elements) || '-'}\n\n`;
                    }
                    mdContent += `### 详细分析\n\n${result.markdown_report || ''}\n\n`;
                } else {
                    mdContent += `${result}\n\n`;
                }
            }
        });
        mdContent += "\n";
    });

    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `summary_detailed_report_${new Date().toISOString().slice(0,10)}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportSummaryPDF = async () => {
      if (questions.length === 0) return;
      setIsExporting(true);
      setExportProgress('准备中...');

      // 保存当前的展开状态，以便结束后恢复（可选，或者就让它保持闭合）
      const originalExpanded = { ...expandedAccordions };
      
      // 先收起所有，避免 DOM 过大
      setExpandedAccordions({});

      try {
          // 临时调整容器样式以显示所有内容
          const originalMaxHeight = questionListRef.current?.style.maxHeight;
          const originalOverflow = questionListRef.current?.style.overflowY;
          
          if (questionListRef.current) {
              questionListRef.current.style.maxHeight = 'none';
              questionListRef.current.style.overflowY = 'visible';
          }

          const pdf = new jsPDF('p', 'mm', 'a4');
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = pdf.internal.pageSize.getHeight();
          let cursorY = 0;
          const margin = 10;
          
          // 分批处理的大小
          const BATCH_SIZE = 5; 
          
          for (let i = 0; i < questions.length; i += BATCH_SIZE) {
              const chunk = questions.slice(i, i + BATCH_SIZE);
              
              setExportProgress(`处理中 ${i + 1}/${questions.length}...`);

              // 1. 展开当前批次的 Accordion
              const batchExpandedState: Record<string, boolean> = {};
              chunk.forEach(q => {
                  configs.forEach(c => {
                      const elementId = `analysis-${q.id}-${c.label}`;
                      batchExpandedState[elementId] = true;
                  });
              });
              setExpandedAccordions(batchExpandedState);

              // 2. 等待渲染
              // 减少等待时间：如果批次小，渲染应该快。800ms 应该足够 Markdown/KaTeX 渲染
              await new Promise(resolve => setTimeout(resolve, 800));

              // 3. 截图当前批次
              for (const q of chunk) {
                  const element = document.getElementById(`question-${q.id}`);
                  if (element) {
                      // 给 UI 线程喘息机会
                      await new Promise(resolve => setTimeout(resolve, 50));

                      const canvas = await html2canvas(element, {
                          scale: 1.5, // 降低一点 Scale 提升速度，默认是 2
                          useCORS: true,
                          logging: false,
                          backgroundColor: '#ffffff'
                      });

                      const imgData = canvas.toDataURL('image/png');
                      const imgWidth = pdfWidth - 2 * margin;
                      const imgHeight = (canvas.height * imgWidth) / canvas.width;

                      // 检查是否需要分页
                      if (cursorY + imgHeight > pdfHeight - margin) {
                          pdf.addPage();
                          cursorY = margin;
                      } else if (cursorY === 0) {
                          cursorY = margin;
                      }

                      pdf.addImage(imgData, 'PNG', margin, cursorY, imgWidth, imgHeight);
                      cursorY += imgHeight + 5;
                  }
              }

              // 4. 收起当前批次，释放 DOM 内存
              setExpandedAccordions({});
          }

          setExportProgress('保存中...');
          pdf.save(`summary_detailed_report_${new Date().toISOString().slice(0,10)}.pdf`);

          // 恢复样式
          if (questionListRef.current) {
              questionListRef.current.style.maxHeight = originalMaxHeight || '';
              questionListRef.current.style.overflowY = originalOverflow || '';
          }
          
          // 恢复原始展开状态 (或者保持全部收起，看用户体验，恢复可能比较卡)
          // setExpandedAccordions(originalExpanded); 
          // 既然已经全部收起了，不如就让它收起，或者只展开用户之前展开的。
          // 这里选择恢复用户之前的状态
          setExpandedAccordions(originalExpanded);

      } catch (error) {
          console.error("Summary PDF export failed", error);
          setError("导出汇总PDF失败");
      } finally {
          setIsExporting(false);
          setExportProgress('');
      }
  };

  // --- History Handlers ---
  const handleSaveSession = async () => {
    if (questions.length === 0) {
        alert("暂无分析结果可保存");
        return;
    }
    setIsSaving(true);
    try {
        const session: RatingSession = {
            id: crypto.randomUUID(),
            examName: file ? file.name.replace(/\.[^/.]+$/, "") : `Analysis-${new Date().toISOString().slice(0, 19).replace('T', ' ')}`,
            createdAt: new Date().toISOString(),
            analysisMode,
            modelConfigs: configs,
            questions,
            schemaVersion: 1
        };

        // Save to IndexedDB
        await saveSessionToIndexedDB(session);

        // Save to Backend (optional, background sync)
        try {
            await axios.post('http://localhost:8000/api/history/save', {
                ...session,
                questionCount: questions.length,
                data: session
            });
        } catch (err) {
            console.warn("Failed to sync to backend", err);
        }

        alert("评级结果保存成功！");
    } catch (err) {
        console.error("Failed to save session", err);
        alert("保存失败");
    } finally {
        setIsSaving(false);
    }
  };

  const handleLoadSession = (session: RatingSession | any) => {
    if (!session) return;
    if (window.confirm("加载历史记录将覆盖当前分析结果，是否继续？")) {
        // Defensive handling for potentially wrapped data or missing fields
        const actualSession = session.data ? session.data : session;
        
        const safeQuestions = Array.isArray(actualSession.questions) ? actualSession.questions : [];
        const safeConfigs = Array.isArray(actualSession.modelConfigs) ? actualSession.modelConfigs : [];

        setQuestions(safeQuestions);
        setConfigs(safeConfigs);
        setAnalysisMode(actualSession.analysisMode || 'sub_question');
        // Reset file to null or a dummy file object if needed, but keeping it null is fine
        setFile(null); 
        // Reset progress
        setProgress({ total: safeQuestions.length, completed: safeQuestions.length });
    }
  };


  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', pb: 4 }}>
      {/* Modern Header */}
      <AppBar position="static" elevation={0} sx={{ mb: 4, bgcolor: 'primary.main' }}>
        <Toolbar sx={{ minHeight: 70 }}>
          <ScienceIcon sx={{ mr: 2, fontSize: 32 }} />
          <Typography variant="h5" component="div" sx={{ flexGrow: 1, fontWeight: 700, letterSpacing: 0.5 }}>
            AI赋能高中化学教学系列by实验中学
          </Typography>
          <Chip label="v1.2" color="secondary" size="small" sx={{ fontWeight: 'bold' }} />
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl">
        <Box sx={{ my: 4 }}>
          <Typography variant="h4" component="h1" gutterBottom align="center" sx={{ fontWeight: 'bold', color: 'primary.main', mb: 1 }}>
            高中化学试题深度标定与学情诊断系统（一键桌面版）
          </Typography>
          <Typography variant="subtitle1" align="center" color="text.secondary" sx={{ mb: 4 }}>
            基于 DeepSeek / 豆包 / 通义千问 / Kimi / 智谱等多模型协同分析
          </Typography>

          {/* 顶部导航栏 */}
          <Paper sx={{ mb: 3, borderRadius: 2 }}>
              <Tabs 
                value={activeTab} 
                onChange={handleTabChange} 
                indicatorColor="primary" 
                textColor="primary" 
                variant="fullWidth"
                sx={{ 
                    '& .MuiTab-root': { fontSize: '1.1rem', py: 2 },
                    '& .Mui-selected': { fontWeight: 'bold' }
                }}
              >
                  <Tab icon={<AutoFixHighIcon />} iconPosition="start" label="第一步：试题深度标定" />
                  <Tab icon={<InsightsIcon />} iconPosition="start" label="第二步：学情诊断分析" />
              </Tabs>
          </Paper>

          {/* Tab 1: 试题深度标定 (现有功能) */}
          {activeTab === 0 && (
          <Grid container spacing={3}>
            {/* Error Alert */}
            {error && (
              <Grid item xs={12}>
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                  {error}
                </Alert>
              </Grid>
            )}
            {/* File Upload Section */}
          <Grid item xs={12} md={5}>
            <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <CardContent sx={{ flex: 1, p: 3 }}>
                <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
                  <CloudUploadIcon sx={{ mr: 1, color: 'primary.main' }} />
                  文件上传
                </Typography>
                <Box
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onClick={() => fileInputRef.current?.click()}
                  sx={{
                    border: '2px dashed',
                    borderColor: 'primary.light',
                    borderRadius: 3,
                    p: 4,
                    mt: 2,
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    bgcolor: 'background.default',
                    '&:hover': { 
                      borderColor: 'primary.main', 
                      bgcolor: 'action.hover',
                      transform: 'scale(1.01)'
                    }
                  }}
                >
                  <input
                      type="file"
                      id="file-input"
                      ref={fileInputRef}
                      style={{ display: 'none' }}
                      accept=".docx,.pdf"
                      onChange={handleFileChange}
                  />
                  <CloudUploadIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
                  <Typography variant="body1">
                    拖放文件到此处或点击上传
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    支持 .docx, .pdf (最大 100MB)
                  </Typography>
                </Box>
              {file && (
                  <Box sx={{ mt: 3 }}>
                      <Typography variant="body2" sx={{ fontWeight: 'bold' }}>已选择: {file.name}</Typography>
                      
                      <FormControl component="fieldset" sx={{ mt: 2, width: '100%' }}>
                        <FormLabel component="legend" sx={{ display: 'flex', alignItems: 'center', fontSize: '0.9rem' }}>
                          分析模式
                          <Tooltip title="小题分析：自动将大题拆分为多个小题进行独立分析；整题分析：将大题作为一个整体进行分析。">
                            <InfoIcon sx={{ fontSize: 16, ml: 0.5, color: 'text.secondary', cursor: 'help' }} />
                          </Tooltip>
                        </FormLabel>
                        <RadioGroup
                          row
                          name="analysisMode"
                          value={analysisMode}
                          onChange={(e) => setAnalysisMode(e.target.value)}
                        >
                          <FormControlLabel value="sub_question" control={<Radio size="small" />} label="小题分析" />
                          <FormControlLabel value="whole" control={<Radio size="small" />} label="整题分析" />
                        </RadioGroup>
                      </FormControl>

                      <Button 
                        variant="contained" 
                        fullWidth 
                        onClick={handleConfirmUpload} 
                        disabled={uploading}
                        sx={{ mt: 2 }}
                      >
                        {uploading ? '上传解析中...' : '确认并解析'}
                      </Button>

                      {uploading && <LinearProgress variant="determinate" value={uploadProgress} sx={{ mt: 1 }} />}
                  </Box>
              )}
              </CardContent>
            </Card>
          </Grid>

          {/* Configuration Section */}
          <Grid item xs={12} md={7}>
            <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <CardContent sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', mb: 3 }}>
                  模型配置
                </Typography>
              
              <Typography variant="subtitle2">并发控制 (1-5)</Typography>
              <Slider
                value={concurrency}
                onChange={handleConcurrencyChange}
                onChangeCommitted={handleConcurrencyChangeCommitted}
                step={1}
                marks
                min={1}
                max={5}
                valueLabelDisplay="auto"
                sx={{ mb: 2 }}
              />

              <Box sx={{ flex: 1, overflowY: 'auto', pr: 1, maxHeight: 600 }}>
                  {configs.map((config) => (
                      <Card key={config.id} variant="outlined" sx={{ mb: 2, bgcolor: '#f8f9fa' }}>
                          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1, color: 'primary.main' }}>
                                  {config.label}
                              </Typography>
                              
                              <Grid container spacing={2}>
                                  <Grid item xs={6}>
                                      <FormControl fullWidth size="small">
                                          <InputLabel>模型厂商</InputLabel>
                                          <Select
                                              value={config.provider}
                                              label="模型厂商"
                                              onChange={(e) => handleConfigChange(config.id, 'provider', e.target.value)}
                                          >
                                              <MenuItem value="deepseek">DeepSeek</MenuItem>
                                              <MenuItem value="doubao">豆包</MenuItem>
                                            <MenuItem value="qwen">通义千问</MenuItem>
                                            <MenuItem value="kimi">Kimi</MenuItem>
                                            <MenuItem value="zhipu">智谱</MenuItem>
                                        </Select>
                                      </FormControl>
                                  </Grid>
                                  <Grid item xs={6}>
                                      <TextField
                                          fullWidth
                                          size="small"
                                          label="API Key"
                                          type="password"
                                          value={config.apiKey}
                                          onChange={(e) => handleConfigChange(config.id, 'apiKey', e.target.value)}
                                      />
                                  </Grid>
                                  <Grid item xs={12}>
                                      <Typography variant="caption" sx={{ cursor: 'pointer', color: 'text.secondary', textDecoration: 'underline' }} onClick={(e) => {
                                          const target = e.currentTarget.nextElementSibling as HTMLElement;
                                          if (target) target.style.display = target.style.display === 'none' ? 'flex' : 'none';
                                      }}>
                                          显示/隐藏高级配置
                                      </Typography>
                                      <Grid container spacing={2} sx={{ mt: 1, display: 'none' }}>
                                          <Grid item xs={12}>
                                              <TextField
                                                  fullWidth
                                                  size="small"
                                                  label="API Endpoint (Base URL)"
                                                  value={config.baseUrl}
                                                  onChange={(e) => handleConfigChange(config.id, 'baseUrl', e.target.value)}
                                              />
                                          </Grid>
                                          <Grid item xs={8}>
                                              <TextField
                                                  fullWidth
                                                  size="small"
                                                  label="Model Name"
                                                  value={config.modelName}
                                                  onChange={(e) => handleConfigChange(config.id, 'modelName', e.target.value)}
                                              />
                                          </Grid>
                                          <Grid item xs={4}>
                                              <TextField
                                                  fullWidth
                                                  size="small"
                                                  label="Temp"
                                                  type="number"
                                                  inputProps={{ step: 0.1, min: 0, max: 2 }}
                                                  value={config.temperature}
                                                  onChange={(e) => handleConfigChange(config.id, 'temperature', parseFloat(e.target.value))}
                                              />
                                          </Grid>
                                      </Grid>
                                  </Grid>
                              </Grid>
                          </CardContent>
                      </Card>
                  ))}
              </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Control Panel */}
          <Grid item xs={12}>
            <Card>
              <CardContent sx={{ p: 3 }}>
              <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
                    <PlayArrowIcon sx={{ mr: 1, color: 'primary.main' }} />
                    分析控制台
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                      题目数量: {questions.length} | 进度: {progress.completed}/{questions.length} | 状态: {analyzing ? "进行中..." : "就绪"}
                  </Typography>
                  {analyzing && estimatedTimeRemaining && (
                    <Typography variant="body2" color="primary" sx={{ mt: 0.5, fontWeight: 'medium' }}>
                        预计剩余时间: 约 {estimatedTimeRemaining}
                    </Typography>
                  )}
                </Box>
                <Stack direction="row" spacing={1}>
                  <Button 
                    variant="outlined" 
                    startIcon={<HistoryIcon />} 
                    onClick={() => setHistoryOpen(true)}
                    sx={{ borderRadius: 2 }}
                  >
                    历史记录
                  </Button>
                  <Button 
                    variant="contained" 
                    color="success"
                    startIcon={isSaving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />} 
                    disabled={questions.length === 0 || isSaving}
                    onClick={handleSaveSession}
                    sx={{ borderRadius: 2 }}
                  >
                    {isSaving ? "保存中..." : "保存评级结果"}
                  </Button>
                  <Button 
                    variant="contained" 
                    startIcon={<PlayArrowIcon />} 
                    disabled={questions.length === 0 || analyzing}
                    onClick={startAnalysis}
                    sx={{ borderRadius: 2 }}
                  >
                    开始分析
                  </Button>
                  <Button 
                    variant="outlined" 
                    color="error" 
                    startIcon={<StopIcon />} 
                    disabled={!analyzing} 
                    onClick={handleStop}
                    sx={{ borderRadius: 2 }}
                  >
                    终止
                  </Button>
                </Stack>
              </Stack>
              <LinearProgress 
                variant="determinate" 
                value={questions.length > 0 ? (progress.completed / questions.length) * 100 : 0} 
                sx={{ 
                  mt: 3, 
                  height: 12, 
                  borderRadius: 6,
                  backgroundColor: '#E3F2FD',
                  '& .MuiLinearProgress-bar': {
                    borderRadius: 6,
                    background: 'linear-gradient(90deg, #1565C0 0%, #42A5F5 100%)'
                  }
                }} 
              />
              </CardContent>
            </Card>
          </Grid>

          {/* Results Placeholder / Question Preview */}
          <Grid item xs={12}>
            <Card sx={{ minHeight: 300 }}>
              <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', mb: 3 }}>
                  <Box component="span" sx={{ width: 4, height: 24, bgcolor: 'secondary.main', mr: 1, borderRadius: 1 }} />
                  {questions.length > 0 ? "题目解析预览" : "分析结果展示"}
                  {questions.length > 0 && (
                      <>
                      <Chip 
                        label={analysisMode === 'sub_question' ? '小题模式' : '整题模式'} 
                        size="small" 
                        color="primary" 
                        variant="outlined" 
                        sx={{ ml: 2, verticalAlign: 'middle' }}
                      />
                      <Box sx={{ flexGrow: 1 }} />
                      <Stack direction="row" spacing={1}>
                          <Button 
                            variant="outlined" 
                            size="small"
                            startIcon={<ExpandMoreIcon sx={{ transform: isAllExpanded() ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s' }} />} 
                            onClick={handleGlobalExpandCollapse}
                          >
                              {isAllExpanded() ? '收起所有详情' : '展开所有详情'}
                          </Button>
                          <Button 
                            variant="outlined" 
                            size="small"
                            startIcon={<DownloadIcon />} 
                            onClick={handleExportSummaryMD}
                          >
                              导出汇总详情(MD)
                          </Button>
                          <Button 
                            variant="outlined" 
                            size="small"
                            startIcon={isExporting ? <CircularProgress size={16} /> : <DownloadIcon />} 
                            onClick={handleExportSummaryPDF}
                            disabled={isExporting}
                          >
                              {isExporting ? (exportProgress || '生成中...') : '导出汇总详情(PDF)'}
                          </Button>
                      </Stack>
                      </>
                  )}
              </Typography>
              
              {questions.length > 0 ? (
                  <Box ref={questionListRef} sx={{ maxHeight: 500, overflowY: 'auto', pr: 1 }}>
                      {questions.map((q) => (
                          <Box id={`question-${q.id}`} key={q.id} sx={{ p: 2, mb: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider', '&:hover': { borderColor: 'primary.light', bgcolor: 'background.default' } }}>
                              <Stack direction="row" spacing={2} justifyContent="space-between" alignItems="flex-start">
                                  <Box flex={1}>
                                      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                                          <Chip label={`题号: ${q.id}`} size="small" color="primary" variant="filled" sx={{ fontWeight: 'bold' }} />
                                      </Stack>
                                      <Tooltip 
                                        title={
                                            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                                                {q.content}
                                            </Typography>
                                        }
                                        placement="bottom-start"
                                        arrow
                                        componentsProps={{
                                            tooltip: {
                                                sx: {
                                                    bgcolor: '#424242',
                                                    maxWidth: 600,
                                                    fontSize: '0.85rem',
                                                    p: 2,
                                                    maxHeight: '400px',
                                                    overflowY: 'auto'
                                                }
                                            }
                                        }}
                                      >
                                          <Typography 
                                            variant="body2" 
                                            sx={{ 
                                                mb: 2, 
                                                p: 1.5, 
                                                bgcolor: '#F5F7FA', 
                                                borderRadius: 1, 
                                                fontFamily: 'monospace',
                                                cursor: 'help',
                                                '&:hover': {
                                                    bgcolor: '#E3F2FD',
                                                    boxShadow: 1
                                                },
                                                transition: 'all 0.2s'
                                            }}
                                          >
                                            {q.preview}
                                          </Typography>
                                      </Tooltip>
                                      
                                      {/* Per-model results */}
                                      <Box sx={{ mt: 2 }}>
                                          {configs.map(config => {
                                              const modelLabel = config.label;
                                              const statusInfo = q.modelStatus?.[modelLabel];
                                              const result = q.analysis?.[modelLabel];
                                              const elementId = `analysis-${q.id}-${modelLabel}`;

                                              return (
                                                  <ModelResultAccordion
                                                    key={modelLabel}
                                                    id={elementId}
                                                    highlighted={highlightedId === elementId}
                                                    modelLabel={modelLabel}
                                                    displayName={getModelDisplayName(modelLabel)}
                                                    statusInfo={statusInfo}
                                                    result={result}
                                                    onRetry={handleRetry}
                                                    questionId={q.id}
                                                    expanded={expandedAccordions[elementId]}
                                                    onExpandedChange={handleAccordionChange}
                                                />
                                              );
                                          })}
                                      </Box>
                                  </Box>
                              </Stack>
                          </Box>
                      ))}
                  </Box>
              ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, color: 'text.secondary', bgcolor: '#F5F7FA', borderRadius: 2, border: '2px dashed #E0E0E0' }}>
                      <ScienceIcon sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
                      <Typography>暂无分析结果，请上传文件并开始分析</Typography>
                  </Box>
              )}
              </CardContent>
            </Card>
          </Grid>
          
          {/* Summary Table & Download */}
          {questions.length > 0 && (
              <Grid item xs={12}>
                  <Card sx={{ mb: 4 }}>
                      <CardContent sx={{ p: 3 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                          <Typography variant="h6" sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
                              <Box component="span" sx={{ width: 4, height: 24, bgcolor: 'secondary.main', mr: 1, borderRadius: 1 }} />
                              难度分级汇总表
                          </Typography>
                          <Stack direction="row" spacing={1}>
                              <Button variant="outlined" startIcon={<DownloadIcon />} onClick={exportToCSV}>
                                  导出 CSV
                              </Button>
                              <Button variant="outlined" startIcon={<DownloadIcon />} onClick={exportToPDF}>
                                  导出 PDF
                              </Button>
                          </Stack>
                      </Stack>
                      <TableContainer sx={{ borderRadius: 2, border: '1px solid #E0E0E0' }} id="summary-table">
                          <Table size="small">
                              <TableHead>
                                  <TableRow sx={{ bgcolor: '#E3F2FD' }}>
                                      <TableCell sx={{ fontWeight: 'bold', color: 'primary.dark' }}>题目编号</TableCell>
                                      <TableCell sx={{ fontWeight: 'bold', color: 'primary.dark' }}>大模型</TableCell>
                                      <TableCell sx={{ fontWeight: 'bold', color: 'primary.dark' }}>难度评级</TableCell>
                                      <TableCell sx={{ fontWeight: 'bold', color: 'primary.dark' }}>框架主题</TableCell>
                                      <TableCell sx={{ fontWeight: 'bold', color: 'primary.dark' }}>能力要素</TableCell>
                                      <TableCell sx={{ fontWeight: 'bold', color: 'primary.dark' }}>考查内容</TableCell>
                                      <TableCell sx={{ fontWeight: 'bold', color: 'primary.dark' }}>耗时(s)</TableCell>
                                      <TableCell sx={{ fontWeight: 'bold', color: 'primary.dark' }}>操作</TableCell>
                                  </TableRow>
                              </TableHead>
                              <TableBody>
                                  {questions.map((q) => {
                                      // 筛选出有分析结果或分析失败的模型
                                      const visibleModels = configs.filter(c => {
                                          const hasResult = q.analysis?.[c.label];
                                          const isFailed = q.modelStatus?.[c.label]?.status === 'failed';
                                          return hasResult || isFailed;
                                      });

                                      if (visibleModels.length === 0) return null;

                                      return visibleModels.map((config, index) => {
                                          const model = config.label;
                                          const result = q.analysis?.[model];
                                          const statusInfo = q.modelStatus?.[model];
                                          
                                          const isCompletedStatus = statusInfo?.status === 'completed';
                                          const isFailedStatus = statusInfo?.status === 'failed';
                                          
                                          const isObject = typeof result === 'object' && result !== null;
                                          const finalLevelRaw = isObject ? (result.final_level || result.comprehensive_rating?.final_level) : "未知";

                                          // 逻辑错误判定
                                          const isLogicalError = isCompletedStatus && (
                                              finalLevelRaw === 'Error' || 
                                              result?.level === 'Error' ||
                                              (typeof result === 'string' && result.includes('Failed to parse JSON'))
                                          );

                                          const isFailed = isFailedStatus || isLogicalError;
                                          
                                          const finalLevel = isFailed ? "分析失败" : finalLevelRaw;
                                          const knowledgeTopic = isFailed ? "-" : ((isObject && result.meta?.knowledge_topic) ? result.meta.knowledge_topic : (q.preview || ""));
                                          const frameworkTopic = isFailed ? "-" : ((isObject && result.meta?.framework_topic) ? result.meta.framework_topic : "-");
                                          const abilityCodes = isFailed ? "-" : (isObject ? extractAbilityCodes(result.meta?.ability_elements) : "无");
                                          
                                          // 视觉强化：同一题目的第一行（不同题目编号的分界处）添加更明显的横向分隔线
                                          // index === 0 表示该题目的第一个结果
                                          const cellStyle = {
                                              borderTop: index === 0 ? '2px solid #1565C0' : '1px solid #E0E0E0',
                                              verticalAlign: 'middle'
                                          };

                                          return (
                                              <TableRow key={`${q.id}-${model}`} hover>
                                                  <TableCell sx={cellStyle}>{q.id}</TableCell>
                                                  <TableCell sx={cellStyle}>{getModelDisplayName(model)}</TableCell>
                                                  <TableCell sx={cellStyle}>
                                                      <Chip 
                                                          label={finalLevel} 
                                                          {...getDifficultyChipProps(isFailed ? 'L0' : finalLevel)} 
                                                          color={isFailed ? "error" : undefined}
                                                          size="small" 
                                                      />
                                                  </TableCell>
                                                  <TableCell sx={cellStyle}>{frameworkTopic}</TableCell>
                                                  <TableCell sx={cellStyle}>{abilityCodes}</TableCell>
                                                  <TableCell sx={{ ...cellStyle, maxWidth: 300, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                      <Tooltip title={knowledgeTopic}>
                                                          <span>{knowledgeTopic}</span>
                                                      </Tooltip>
                                                  </TableCell>
                                                  <TableCell sx={cellStyle}>{result?.elapsed_time || '-'}</TableCell>
                                                  <TableCell sx={cellStyle}>
                                                      <Stack direction="row" spacing={1} alignItems="center">
                                                          <Button
                                                              variant="contained"
                                                              size="small"
                                                              onClick={() => handleScrollToAnalysis(q.id, model)}
                                                              sx={{
                                                                  width: '80px',
                                                                  height: '28px',
                                                                  minWidth: '80px',
                                                                  padding: 0,
                                                                  fontSize: '12px'
                                                              }}
                                                          >
                                                              详细报告
                                                          </Button>
                                                          {isFailed && (
                                                              <Button
                                                                  variant="outlined"
                                                                  color="error"
                                                                  size="small"
                                                                  onClick={() => handleRetry(q.id, model)}
                                                                  startIcon={<RefreshIcon sx={{ fontSize: 14 }} />}
                                                                  sx={{
                                                                      width: '80px',
                                                                      height: '28px',
                                                                      minWidth: '80px',
                                                                      padding: 0,
                                                                      fontSize: '12px'
                                                                  }}
                                                              >
                                                                  重新评定
                                                              </Button>
                                                          )}
                                                      </Stack>
                                                  </TableCell>
                                              </TableRow>
                                          );
                                      });
                                  })}
                                  {questions.every(q => q.status !== 'completed') && (
                                      <TableRow>
                                          <TableCell colSpan={8} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                                              暂无数据
                                          </TableCell>
                                      </TableRow>
                                  )}
                              </TableBody>
                          </Table>
                      </TableContainer>

                      {/* 难度矩阵可视化 */}
                      <DifficultyMatrix 
                          questions={questions} 
                          configs={configs} 
                          loading={analyzing} 
                          onCellClick={handleScrollToAnalysis}
                      />
                  </CardContent>
                  </Card>
              </Grid>
          )}

          {/* 数据可视化区域 */}
          {questions.length > 0 && (
              <Grid item xs={12}>
                  <DataVisualization questions={questions} />
              </Grid>
          )}

        </Grid>
        )}

        {/* Tab 2: 学情诊断分析 (新功能占位) */}
        <Box sx={{ py: 4, display: activeTab === 1 ? 'block' : 'none' }}>
            {questions.length === 0 ? (
                <Alert severity="warning" sx={{ maxWidth: 600, mx: 'auto', mb: 3 }}>
                    请先在“第一步：试题深度标定”中上传并分析试题，系统需要基于试题的难度的能力指标来进行学情诊断。
                </Alert>
            ) : (
                <ScoreAnalysisView questions={questions} modelConfigs={configs} />
            )}
        </Box>

      </Box>
      </Container>
        

        <HistorySelector 
            open={historyOpen} 
            onClose={() => setHistoryOpen(false)} 
            onLoad={handleLoadSession} 
        />
    </Box>
  );
}

export default App;
