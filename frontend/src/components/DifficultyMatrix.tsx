import React from 'react';
import { Box, Paper, Typography, Tooltip, Fade, CircularProgress } from '@mui/material';
import { Question, ModelConfig } from '../types';
import { getDifficultyChipProps, extractAbilityCodes, getModelDisplayLabel } from '../utils/helpers';

interface DifficultyMatrixProps {
    questions: Question[];
    configs: ModelConfig[];
    loading?: boolean;
    onCellClick?: (questionId: string, modelLabel: string) => void;
}

const BLOCK_SIZE = 24;
const GAP_SIZE = 4;

export const DifficultyMatrix: React.FC<DifficultyMatrixProps> = ({ questions, configs, loading, onCellClick }) => {
    // 移除阻塞性 loading 检查，允许实时显示部分结果
    if (!questions || questions.length === 0) {
        if (loading) {
             return (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                    <CircularProgress />
                </Box>
            );
        }
        return null;
    }

    return (
        <Paper 
            elevation={0} 
            sx={{ 
                p: 3, 
                mt: 3, 
                borderRadius: 3, 
                border: '1px solid',
                borderColor: 'divider',
                backgroundColor: 'background.paper',
                boxShadow: '0px 4px 20px rgba(0, 0, 0, 0.05)'
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary', mr: 2 }}>
                    难度分布矩阵
                </Typography>
                {loading && <CircularProgress size={20} />}
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: `${GAP_SIZE}px`, overflowX: 'auto', p: 2 }}>
                {configs.map((config, index) => (
                    <Box key={config.id} sx={{ display: 'flex', alignItems: 'center', minWidth: 'fit-content' }}>
                        {/* Model Name Label (Hollow Block with Number) */}
                        <Tooltip 
                            title={getModelDisplayLabel(config)} 
                            placement="right"
                            arrow
                            TransitionComponent={Fade}
                            TransitionProps={{ timeout: 200 }}
                        >
                             <Box
                                sx={{
                                    width: BLOCK_SIZE,
                                    height: BLOCK_SIZE,
                                    minWidth: BLOCK_SIZE,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    border: '1px solid black',
                                    borderRadius: '2px',
                                    mr: 2, // Margin right to separate from matrix
                                    cursor: 'default',
                                    fontSize: '0.75rem',
                                    fontWeight: 'bold',
                                    color: 'text.primary',
                                    bgcolor: 'transparent',
                                    transition: 'all 0.2s ease-in-out',
                                    '&:hover': {
                                        transform: 'scale(1.5)',
                                        bgcolor: 'background.paper',
                                        zIndex: 10,
                                        boxShadow: 1
                                    }
                                }}
                            >
                                {index + 1}
                            </Box>
                        </Tooltip>

                        {/* Matrix Row */}
                        <Box sx={{ display: 'flex', gap: `${GAP_SIZE}px`, alignItems: 'center' }}>
                            {questions.map((question) => {
                                // Extract data for this model
                                // Fix: Use question.analysis which contains the actual result object
                                // modelStatus.result might be the wrapper { model_label: ..., result: ... }
                                const analysisResult = question.analysis?.[config.label];
                                const modelStatus = question.modelStatus?.[config.label];
                                const isCompleted = modelStatus?.status === 'completed';
                                
                                let difficultyLevel = "未知";
                                let abilityElements = undefined;

                                if (isCompleted && analysisResult) {
                                    if (typeof analysisResult === 'object') {
                                        difficultyLevel = analysisResult.final_level || analysisResult.comprehensive_rating?.final_level || "未知";
                                        abilityElements = analysisResult.meta?.ability_elements;
                                    }
                                }

                                const chipProps = getDifficultyChipProps(difficultyLevel);
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const sx = chipProps.sx as any;
                                // Use the main color for the square to ensure visibility
                                const color = sx?.color || '#e0e0e0';
                                
                                return (
                                    <Tooltip
                                        key={question.id}
                                        title={
                                            <Box sx={{ p: 0.5 }}>
                                                <Typography variant="caption" display="block" sx={{ fontWeight: 'bold' }}>
                                                    题目: {question.id}
                                                </Typography>
                                                <Typography variant="caption" display="block">
                                                    难度: {difficultyLevel}
                                                </Typography>
                                                <Typography variant="caption" display="block">
                                                    能力要素: {extractAbilityCodes(abilityElements)}
                                                </Typography>
                                            </Box>
                                        }
                                        TransitionComponent={Fade}
                                        TransitionProps={{ timeout: 200 }}
                                        arrow
                                    >
                                        <Box
                                            onClick={() => onCellClick && onCellClick(question.id, config.label)}
                                            sx={{
                                                width: BLOCK_SIZE,
                                                height: BLOCK_SIZE,
                                                borderRadius: '2px',
                                                bgcolor: color,
                                                border: `1px solid ${color}`, // 轮廓和填充同色
                                                cursor: 'pointer',
                                                transition: 'all 0.2s ease-in-out',
                                                '&:hover': {
                                                    transform: 'scale(1.5)',
                                                    boxShadow: `0 0 8px ${color}`,
                                                    zIndex: 10
                                                }
                                            }}
                                        />
                                    </Tooltip>
                                );
                            })}
                        </Box>
                    </Box>
                ))}
                
                {/* X-Axis Labels (Question IDs) */}
                 <Box sx={{ display: 'flex', ml: `${BLOCK_SIZE + 16}px`, gap: `${GAP_SIZE}px` }}>
                    {questions.map((q, index) => (
                         <Typography 
                            key={q.id} 
                            variant="caption" 
                            sx={{ 
                                width: BLOCK_SIZE, 
                                textAlign: 'center', 
                                fontSize: '0.6rem', 
                                color: 'text.disabled',
                                visibility: index % 5 === 0 ? 'visible' : 'hidden' 
                            }}
                        >
                            {q.id}
                        </Typography>
                    ))}
                </Box>
            </Box>
        </Paper>
    );
};
