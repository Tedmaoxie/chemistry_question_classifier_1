import { ChipProps } from '@mui/material';
import { ModelConfig } from '../types';

export const PROVIDER_NAMES: Record<string, string> = {
    deepseek: 'DeepSeek',
    doubao: '豆包',
    qwen: '通义千问',
    kimi: 'Kimi',
    zhipu: '智谱'
};

export const getModelDisplayLabel = (config: ModelConfig) => {
    // 1. 如果有自定义且非默认的 label，优先使用
    if (config.label && !config.label.startsWith('并发') && !config.label.startsWith('模型')) {
        return config.label;
    }
    // 2. 使用 Provider Name
    return PROVIDER_NAMES[config.provider] || config.provider;
};

export const extractAbilityCodes = (elements: string[] | undefined) => {
    if (!elements || !Array.isArray(elements)) return "无";
    // 匹配 A1-C3 的模式，如果没有匹配到则尝试保留原样（或取前两字符）
    const codes = elements.map(e => {
        const match = e.match(/([A-C][1-3])/);
        return match ? match[1] : e.substring(0, 2);
    });
    return codes.join(", ");
};

export const getDifficultyChipProps = (level: string): ChipProps => {
    const props: ChipProps = { size: 'small', variant: 'outlined', sx: { fontWeight: 'bold' } };
    
    if (!level) return props;
    
    if (level.includes('L1')) {
        props.sx = { ...props.sx, color: '#2e7d32', borderColor: '#2e7d32', bgcolor: '#e8f5e9' }; // Green
    } else if (level.includes('L2')) {
        props.sx = { ...props.sx, color: '#0277bd', borderColor: '#0277bd', bgcolor: '#e1f5fe' }; // Light Blue
    } else if (level.includes('L3')) {
        props.sx = { ...props.sx, color: '#ef6c00', borderColor: '#ef6c00', bgcolor: '#fff3e0' }; // Orange
    } else if (level.includes('L4')) {
        props.sx = { ...props.sx, color: '#d84315', borderColor: '#d84315', bgcolor: '#fbe9e7' }; // Deep Orange
    } else if (level.includes('L5')) {
        props.sx = { ...props.sx, color: '#c62828', borderColor: '#c62828', bgcolor: '#ffebee' }; // Red
    }
    return props;
};
