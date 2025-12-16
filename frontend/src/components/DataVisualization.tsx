import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import { Card, CardContent, Typography, GridLegacy as Grid, Box } from '@mui/material';
import { Question } from '../types';
import { processChartData } from '../utils/chartDataProcessor';

interface DataVisualizationProps {
    questions: Question[];
}

export const DataVisualization: React.FC<DataVisualizationProps> = ({ questions }) => {
    // const theme = useTheme();

    // --- Data Processing ---
    const { difficultyData, abilityData, frameworkData } = useMemo(() => {
        return processChartData(questions);
    }, [questions]);

    // --- Chart Options ---

    // 1. Difficulty Distribution (Donut Chart)
    const difficultyOption = {
        tooltip: {
            trigger: 'item',
            formatter: '{b}: {c} ({d}%)'
        },
        legend: {
            bottom: '0%',
            left: 'center'
        },
        // Matching system colors: L1(Green), L2(Blue), L3(Orange), L4(Deep Orange), L5(Red)
        color: ['#2e7d32', '#0277bd', '#ef6c00', '#d84315', '#c62828'], 
        series: [
            {
                name: '难度评级',
                type: 'pie',
                radius: ['40%', '70%'],
                avoidLabelOverlap: false,
                itemStyle: {
                    borderRadius: 10,
                    borderColor: '#fff',
                    borderWidth: 2
                },
                label: {
                    show: false,
                    position: 'center'
                },
                emphasis: {
                    label: {
                        show: true,
                        fontSize: 20,
                        fontWeight: 'bold'
                    }
                },
                labelLine: {
                    show: false
                },
                data: difficultyData
            }
        ]
    };

    // 2. Ability Distribution (Bar Chart with gradient)
    const abilityOption = {
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' }
        },
        grid: {
            left: '3%',
            right: '4%',
            bottom: '3%',
            containLabel: true
        },
        xAxis: [
            {
                type: 'category',
                data: abilityData.categories,
                axisTick: { alignWithLabel: true }
            }
        ],
        yAxis: [
            {
                type: 'value'
            }
        ],
        series: [
            {
                name: '出现次数',
                type: 'bar',
                barWidth: '60%',
                data: abilityData.values,
                itemStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: '#83bff6' },
                        { offset: 0.5, color: '#188df0' },
                        { offset: 1, color: '#188df0' }
                    ])
                },
                emphasis: {
                    itemStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: '#2378f7' },
                            { offset: 0.7, color: '#2378f7' },
                            { offset: 1, color: '#83bff6' }
                        ])
                    }
                }
            }
        ]
    };

    // 3. Framework Knowledge (Donut Chart - Simplified)
    const frameworkOption = {
        tooltip: {
            trigger: 'item',
            formatter: '{b}: {c} ({d}%)'
        },
        legend: {
            top: '5%',
            left: 'center'
        },
        series: [
            {
                name: '框架知识',
                type: 'pie',
                radius: ['40%', '70%'],
                avoidLabelOverlap: false,
                itemStyle: {
                    borderRadius: 10,
                    borderColor: '#fff',
                    borderWidth: 2
                },
                label: {
                    show: false,
                    position: 'center'
                },
                emphasis: {
                    label: {
                        show: true,
                        fontSize: 14,
                        fontWeight: 'bold'
                    }
                },
                labelLine: {
                    show: false
                },
                data: frameworkData
            }
        ]
    };

    if (questions.length === 0) {
        return null;
    }

    return (
        <Box sx={{ mt: 4, mb: 4 }}>
            <Typography variant="h6" sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', mb: 3 }}>
                <Box component="span" sx={{ width: 4, height: 24, bgcolor: 'secondary.main', mr: 1, borderRadius: 1 }} />
                数据可视化分析
            </Typography>
            <Grid container spacing={3}>
                {/* 1. Difficulty Rating Distribution */}
                <Grid item xs={12} md={4}>
                    <Card sx={{ height: '100%', borderRadius: 3, boxShadow: 3 }}>
                        <CardContent>
                            <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 2, textAlign: 'center' }}>
                                难度评级分布
                            </Typography>
                            <ReactECharts option={difficultyOption} style={{ height: '300px', width: '100%' }} />
                        </CardContent>
                    </Card>
                </Grid>

                {/* 2. Ability Element Distribution */}
                <Grid item xs={12} md={4}>
                    <Card sx={{ height: '100%', borderRadius: 3, boxShadow: 3 }}>
                        <CardContent>
                            <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 2, textAlign: 'center' }}>
                                能力要素分布
                            </Typography>
                            <ReactECharts option={abilityOption} style={{ height: '300px', width: '100%' }} />
                        </CardContent>
                    </Card>
                </Grid>

                {/* 3. Framework Knowledge Ability */}
                <Grid item xs={12} md={4}>
                    <Card sx={{ height: '100%', borderRadius: 3, boxShadow: 3 }}>
                        <CardContent>
                            <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 2, textAlign: 'center' }}>
                                框架知识能力分布
                            </Typography>
                            <ReactECharts option={frameworkOption} style={{ height: '300px', width: '100%' }} />
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>
        </Box>
    );
};
