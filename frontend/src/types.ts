export interface ModelTaskStatus {
    status: 'pending' | 'processing' | 'completed' | 'failed';
    taskId?: string;
    result?: any;
    error?: string;
    startTime?: number;
    endTime?: number;
}

export interface Question {
    id: string;
    content: string;
    preview: string;
    analysis?: Record<string, any>;
    modelStatus?: Record<string, ModelTaskStatus>;
    status?: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface ModelConfig {
    id: number;
    label: string;
    provider: string;
    apiKey: string;
    baseUrl: string;
    modelName: string;
    temperature: number;
}
