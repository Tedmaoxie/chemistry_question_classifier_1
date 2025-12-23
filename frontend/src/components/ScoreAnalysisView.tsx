import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
    Box, Card, CardContent, Typography, Button, 
    GridLegacy as Grid, Alert, LinearProgress, Stack, Divider,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
    Tabs, Tab, AlertTitle, Dialog, DialogTitle, DialogContent, IconButton, Tooltip,
    CircularProgress, Fade, CardActions, Collapse, Avatar, TextField, Chip,
    Accordion, AccordionSummary, AccordionDetails, Select, MenuItem
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DownloadIcon from '@mui/icons-material/Download';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AssignmentIcon from '@mui/icons-material/Assignment';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import StarIcon from '@mui/icons-material/Star';
import TimelineIcon from '@mui/icons-material/Timeline';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import RefreshIcon from '@mui/icons-material/Refresh';
import axios from 'axios';
import * as echarts from 'echarts';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

import { Question, ModelConfig } from '../types';
import { getModelDisplayLabel } from '../utils/helpers';

const BLOCK_SIZE = 24;

const FRAMEWORK_TOPICS = [
    '有机化学', '热化学', '速率平衡', '电化学', '水溶液', 
    '原理综合', '物质结构', '无机综合', '实验探究'
];

interface ScoreAnalysisViewProps {
    questions: Question[];
    modelConfigs: ModelConfig[];
}

interface TaskInfo {
    id: string; // Student ID or 'class_analysis'
    modelLabel: string;
    configId: number;
    taskId: string;
    status: 'pending' | 'processing' | 'success' | 'failure';
    result?: any;
    error?: string;
}

// --- Helper Components ---

const FormatInstruction = ({ mode }: { mode: 'class' | 'student' }) => {
    const handleDownloadSample = () => {
        let content = "";
        let filename = "";
        if (mode === 'class') {
            content = "question_id,full_score,score_rate\nQ1,10,0.85\nQ2,10,0.76\nQ3,5,0.92";
            filename = "class_sample.csv";
        } else {
            // Updated sample to show Full Score Row format
            content = "student_id,Q1,Q2,Q3\nFull Score,10,10,5\nStudentA,8,7,4\nStudentB,9,8,5";
            filename = "student_sample.csv";
        }
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <Box sx={{ mt: 2, mb: 2 }}>
            <Alert severity="info" icon={<HelpOutlineIcon />}>
                <AlertTitle>{mode === 'class' ? '集体分析模式' : '个人分析模式'} 数据格式要求</AlertTitle>
                <Typography variant="body2" paragraph>
                    {mode === 'class' 
                        ? "适用于对全班或全年级的整体考试情况进行分析。系统将根据每道题的平均得分率，分析班级的整体知识掌握情况和薄弱点。"
                        : "适用于对每位学生的具体答题情况进行个性化分析。支持两种满分定义方式：1. 独立满分行 (推荐，第一行首列填'满分')；2. 列名标注 (如 Q1(3分))。"}
                </Typography>
                
                <Typography variant="subtitle2" sx={{ mt: 1, fontWeight: 'bold' }}>支持格式:</Typography>
                <Typography variant="body2">.xlsx (Excel), .csv</Typography>

                <Typography variant="subtitle2" sx={{ mt: 1, fontWeight: 'bold' }}>文件大小限制:</Typography>
                <Typography variant="body2">不超过 10MB</Typography>

                <Typography variant="subtitle2" sx={{ mt: 1, fontWeight: 'bold' }}>字段结构要求:</Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ mt: 1, mb: 1, maxWidth: 500 }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                <TableCell>字段名称</TableCell>
                                <TableCell>是否必填</TableCell>
                                <TableCell>说明</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {mode === 'class' ? (
                                <>
                                    <TableRow>
                                        <TableCell>题号 / question_id</TableCell>
                                        <TableCell>是</TableCell>
                                        <TableCell>题目唯一标识 (如 Q1)</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell>满分 / full_score</TableCell>
                                        <TableCell>否</TableCell>
                                        <TableCell>该题的满分值 (默认为10)</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell>得分率 / score_rate</TableCell>
                                        <TableCell>是</TableCell>
                                        <TableCell>0-1之间的小数或0-100的数值</TableCell>
                                    </TableRow>
                                </>
                            ) : (
                                <>
                                    <TableRow>
                                        <TableCell>姓名 / student_id</TableCell>
                                        <TableCell>是</TableCell>
                                        <TableCell>学生唯一标识</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell>满分行 / Full Score Row (可选)</TableCell>
                                        <TableCell>否</TableCell>
                                        <TableCell>第一行首列填写"满分"，后续列填写对应题目满分</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell>Q1(10分)... (列名)</TableCell>
                                        <TableCell>否</TableCell>
                                        <TableCell>若无满分行，建议在列名中标注满分</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell>Q1, Q2... (得分)</TableCell>
                                        <TableCell>是</TableCell>
                                        <TableCell>每道题的具体得分 (数值)</TableCell>
                                    </TableRow>
                                </>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>

                <Button size="small" variant="outlined" startIcon={<CloudUploadIcon />} onClick={handleDownloadSample}>
                    下载示例文件 ({mode === 'class' ? 'CSV' : 'CSV'})
                </Button>
            </Alert>


        </Box>
    );
};

// --- Chart Components ---

const AnalysisCharts = ({ result, mode, studentRow, classAverages, fullScores, questions }: { 
    result: any, 
    mode: 'class' | 'student',
    studentRow?: any,
    classAverages?: Record<string, number>,
    fullScores?: Record<string, number>,
    questions?: Question[]
}) => {
    const chart1Ref = useRef<HTMLDivElement>(null);
    const chart2Ref = useRef<HTMLDivElement>(null);
    const chart3Ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!result) return;

        const chart1 = chart1Ref.current ? echarts.init(chart1Ref.current) : null;
        const chart2 = chart2Ref.current ? echarts.init(chart2Ref.current) : null;
        const chart3 = chart3Ref.current ? echarts.init(chart3Ref.current) : null;

        const resizeHandler = () => {
            chart1?.resize();
            chart2?.resize();
            chart3?.resize();
        };
        window.addEventListener('resize', resizeHandler);

        // Calculate covered abilities from questions
        const coveredAbilities = new Set<string>();
        if (questions) {
            questions.forEach(q => {
                // Try to find ability in meta from any analysis key, or specific if needed.
                // Assuming standard keys or iterating all.
                if (q.analysis) {
                    Object.values(q.analysis).forEach((an: any) => {
                        if (an?.meta?.ability_elements) {
                            const abs = an.meta.ability_elements;
                            const list = Array.isArray(abs) ? abs : (typeof abs === 'string' ? abs.split(/[,，]/) : []);
                            list.forEach((a: string) => coveredAbilities.add(a.trim()));
                        }
                    });
                }
            });
        }

        try {
            if (mode === 'class') {
                // 1. 难度分布 (柱状图)
                if (chart1 && result["总体分析"] && result["总体分析"]["各等级得分率分析"]) {
                    const levels = ["L1", "L2", "L3", "L4", "L5"];
                    const rates = levels.map(l => {
                        const val = result["总体分析"]["各等级得分率分析"][l]?.["平均得分率"];
                        let numVal = parseFloat(String(val).replace('%', '')) || 0;
                        if (numVal <= 1.05 && numVal >= 0) { 
                             numVal = numVal * 100;
                        }
                        return parseFloat(numVal.toFixed(1));
                    });

                    chart1.setOption({
                        title: { text: '难度分级得分率', left: 'center' },
                        tooltip: { trigger: 'axis' },
                        xAxis: { type: 'category', data: levels },
                        yAxis: { type: 'value', name: '得分率(%)', max: 100 },
                        series: [{
                            data: rates,
                            type: 'bar',
                            itemStyle: { color: '#4285F4' },
                            label: { show: true, position: 'top', formatter: '{c}%' }
                        }]
                    });
                }

                // 2. 知识主题掌握度 (雷达图)
                if (chart2 && result["知识主题分析"]) {
                    const topics = result["知识主题分析"].map((t: any) => t["框架知识主题"]);
                    const scores = result["知识主题分析"].map((t: any) => {
                        let val = parseFloat(String(t["平均得分率"]).replace('%', '')) || 0;
                        if (val <= 1.05 && val >= 0) val = val * 100;
                        return parseFloat(val.toFixed(1));
                    });

                    chart2.setOption({
                        title: { text: '知识主题掌握度', left: 'center' },
                        tooltip: { trigger: 'axis' },
                        radar: {
                            indicator: topics.map((t: string) => ({ name: t, max: 100 })),
                            radius: '60%',
                            center: ['50%', '60%']
                        },
                        series: [{
                            type: 'radar',
                            data: [{
                                value: scores,
                                name: '平均得分率',
                                areaStyle: { color: 'rgba(66, 133, 244, 0.2)' },
                                lineStyle: { color: '#4285F4' }
                            }]
                        }]
                    });
                }

                // 3. 能力素养雷达图 (新增)
                // Need to compute from questions + classAverages
                if (chart3) {
                    if (questions && classAverages && fullScores) {
                        const abilityStats: Record<string, { earned: number, total: number }> = {};
                        
                        questions.forEach((q, idx) => {
                            // Ensure ID matches the normalized score data (Q1, Q2...)
                            // This must match handleUpload normalization logic
                            const normalizedId = `Q${idx + 1}`;
                            
                            let abilities: string[] = [];
                            // Use first available analysis or specific logic
                            if (q.analysis) {
                                const found = Object.values(q.analysis).find((an: any) => an?.meta?.ability_elements);
                                if (found) {
                                    const abs = (found as any).meta.ability_elements;
                                    abilities = Array.isArray(abs) ? abs : (typeof abs === 'string' ? abs.split(/[,，]/) : []);
                                }
                            }
                            
                            if (abilities.length > 0) {
                                const avg = classAverages[normalizedId] || 0;
                                const full = fullScores[normalizedId] || 10;
                                
                                abilities.forEach(ab => {
                                    const key = ab.trim();
                                    if (!key) return;
                                    if (!abilityStats[key]) abilityStats[key] = { earned: 0, total: 0 };
                                    abilityStats[key].earned += avg;
                                    abilityStats[key].total += full;
                                });
                            }
                        });

                        const indicators = Object.keys(abilityStats).map(key => ({ name: key, max: 100 }));
                        const values = Object.keys(abilityStats).map(key => {
                            const stat = abilityStats[key];
                            return stat.total > 0 ? parseFloat(((stat.earned / stat.total) * 100).toFixed(1)) : 0;
                        });

                        if (indicators.length > 0) {
                            chart3.setOption({
                                title: { text: '能力素养雷达图', left: 'center' },
                                tooltip: { trigger: 'item' },
                                radar: {
                                    indicator: indicators,
                                    radius: '60%',
                                    center: ['50%', '60%']
                                },
                                series: [{
                                    type: 'radar',
                                    data: [{
                                        value: values,
                                        name: '平均得分率',
                                        areaStyle: { color: 'rgba(66, 133, 244, 0.2)' },
                                        lineStyle: { color: '#4285F4' }
                                    }]
                                }]
                            });
                        } else {
                            chart3.setOption({
                                title: { text: '能力素养雷达图 (暂无数据)', left: 'center', subtext: '未检测到题目关联的能力要素' }
                            });
                        }
                    } else {
                        chart3.setOption({
                             title: { text: '能力素养雷达图 (暂无数据)', left: 'center' }
                        });
                    }
                }

            } else {
                // 学生模式
                // 1. 能力素养雷达图
                if (chart1 && result["能力要素分析"]) {
                    const mapLevelToScore = (lvl: string) => {
                        if (!lvl) return -1;
                        // 1. 优先处理 "未涉及" / "未考查"
                        if (lvl.includes('未涉及') || lvl.includes('未考查')) return -1; // -1 表示未考查
                        
                        // 2. 尝试提取具体数值 (如 "85%", "0%", "100%")
                        const percentageMatch = lvl.match(/(\d+(\.\d+)?)%/);
                        if (percentageMatch) {
                            return parseFloat(percentageMatch[1]);
                        }

                        // 3. 静态映射兜底
                        if (lvl.includes('优秀')) return 95;
                        if (lvl.includes('良好')) return 80;
                        if (lvl.includes('一般')) return 60;
                        if (lvl.includes('薄弱')) return 40;
                        
                        return 50;
                    };

                    const indicators: {name: string, max: number, color?: string}[] = [];
                    const values: number[] = [];
                    let hasUncovered = false;

                    const categories = ["学习理解能力", "应用实践能力", "迁移创新能力"];
                    categories.forEach(cat => {
                        const subCats = result["能力要素分析"][cat];
                        if (subCats) {
                            Object.keys(subCats).forEach(key => {
                                // 覆盖率检测：即使未覆盖也显示（值为0），但在报告中说明
                                let score = mapLevelToScore(subCats[key]["掌握程度"]);
                                const isUncovered = score === -1;
                                
                                if (isUncovered) {
                                    hasUncovered = true;
                                    score = 0; // 图表上显示为0
                                }

                                indicators.push({ 
                                    name: key + (isUncovered ? '\n(未考查)' : ''), 
                                    max: 100, 
                                    color: isUncovered ? '#999999' : '#333333' 
                                });
                                values.push(score);
                            });
                        }
                    });

                    if (indicators.length > 0) {
                        chart1.setOption({
                            title: { 
                                text: '能力素养雷达图', 
                                left: 'center',
                                subtext: hasUncovered ? '注：灰色项目表示本次测试未考查' : undefined,
                                subtextStyle: { color: '#999999', fontSize: 12 }
                            },
                            tooltip: {},
                            radar: {
                                indicator: indicators,
                                radius: '60%',
                                center: ['50%', '60%']
                            },
                            series: [{
                                type: 'radar',
                                data: [{
                                    value: values,
                                    name: '能力水平',
                                    areaStyle: { color: 'rgba(52, 168, 83, 0.2)' },
                                    lineStyle: { color: '#34A853' }
                                }]
                            }]
                        });
                    } else {
                        // If no indicators (e.g. no coverage info or all filtered), maybe show empty or handle gracefully
                        chart1.clear();
                        chart1.setOption({
                            title: { text: '能力素养雷达图 (暂无数据)', left: 'center' }
                        });
                    }
                }

                // 2. 知识主题掌握情况 (柱状图)
                if (chart2 && result["知识主题掌握情况"]) {
                    const data = result["知识主题掌握情况"];
                    const topics = data.map((d: any) => d["知识主题"]);
                    const scores = data.map((d: any) => {
                        let val = parseFloat(String(d["掌握程度"]).replace('%', '')) || 0;
                        if (val <= 1.05 && val >= 0) val = val * 100;
                        return parseFloat(val.toFixed(1));
                    });

                    chart2.setOption({
                        title: { text: '知识主题掌握情况', left: 'center' },
                        tooltip: { trigger: 'axis' },
                        xAxis: { type: 'category', data: topics, axisLabel: { interval: 0, rotate: 30 } },
                        yAxis: { type: 'value', max: 100 },
                        series: [{
                            type: 'bar',
                            data: scores,
                            itemStyle: { color: '#FBBC05' },
                            label: { show: true, position: 'top', formatter: '{c}%' }
                        }]
                    });
                }
                
                // 3. 个人得分 vs 班级平均 vs 满分 (折线图)
                if (chart3 && studentRow && classAverages) {
                    const questions = Object.keys(classAverages);
                    
                    const studentScores = questions.map(q => parseFloat(studentRow[q]) || 0);
                    const averageScores = questions.map(q => classAverages[q] || 0);
                    
                    const fullScoresList = questions.map(q => {
                         if (fullScores && fullScores[q] !== undefined) {
                             return fullScores[q];
                         }
                         const match = q.match(/[\(（](\d+)分?[\)）]/);
                         return match ? parseFloat(match[1]) : 10;
                    });
                    
                    const series: any[] = [
                        {
                            name: '个人得分',
                            type: 'line',
                            data: studentScores,
                            itemStyle: { color: '#34A853' },
                            markPoint: {
                                data: [
                                    { type: 'max', name: 'Max' },
                                    { type: 'min', name: 'Min' }
                                ]
                            }
                        },
                        {
                            name: '班级平均',
                            type: 'line',
                            data: averageScores,
                            itemStyle: { color: '#4285F4' },
                            lineStyle: { type: 'dashed' }
                        }
                    ];

                    if (fullScoresList.some(s => s > 0)) {
                        series.push({
                            name: '满分',
                            type: 'line',
                            data: fullScoresList,
                            itemStyle: { color: '#EA4335' },
                            lineStyle: { type: 'dotted', width: 1 },
                            symbol: 'none'
                        });
                    }

                    chart3.setOption({
                        title: { text: '个人得分 vs 班级平均 vs 满分', left: 'center' },
                        tooltip: { trigger: 'axis' },
                        legend: { data: ['个人得分', '班级平均', '满分'], bottom: 0 },
                        xAxis: { type: 'category', data: questions },
                        yAxis: { type: 'value' },
                        series: series
                    });
                }
            }
        } catch (e) {
            console.error("Chart render error", e);
        }

        return () => {
            window.removeEventListener('resize', resizeHandler);
            chart1?.dispose();
            chart2?.dispose();
            chart3?.dispose();
        };
    }, [result, mode, studentRow, classAverages, fullScores, questions]);

    return (
        <Grid container spacing={2} sx={{ mb: 4 }}>
            <Grid item xs={12} md={6}>
                <Card variant="outlined">
                    <CardContent>
                        <div ref={chart1Ref} style={{ width: '100%', height: '350px' }} />
                    </CardContent>
                </Card>
            </Grid>
            <Grid item xs={12} md={6}>
                <Card variant="outlined">
                    <CardContent>
                        <div ref={chart2Ref} style={{ width: '100%', height: '350px' }} />
                    </CardContent>
                </Card>
            </Grid>
            {/* Class Mode Chart 3 or Student Mode Chart 3 */}
            {(mode === 'student' || mode === 'class') && (
                <Grid item xs={12} md={mode === 'class' ? 6 : 12}>
                     <Card variant="outlined">
                        <CardContent>
                            <div ref={chart3Ref} style={{ width: '100%', height: '350px' }} />
                        </CardContent>
                    </Card>
                </Grid>
            )}
        </Grid>
    );
};

const ScoreDataOverview = ({ data, mode }: { data: any[], mode: 'class' | 'student' }) => {
    const chartRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!data || data.length === 0 || !chartRef.current) return;
        
        const chart = echarts.init(chartRef.current);
        
        // 决定可视化模式: 班级模式->折线图; 学生模式->热力图
        const showLineChart = mode === 'class';

        if (showLineChart) {
            // 准备折线图数据
            let questions: string[] = [];
            let rawValues: number[] = [];
            
            if (data[0].hasOwnProperty('score_rate')) {
                // 情况A: 已聚合数据
                questions = data.map(d => d.question_id);
                rawValues = data.map(d => parseFloat(d.score_rate));
            } else {
                // 情况B: 原始数据 -> 计算平均值
                const questionKeys = Object.keys(data[0]).filter(k => k !== 'student_id' && k !== '姓名' && k !== '学号' && k !== 'name');
                questions = questionKeys;
                rawValues = questionKeys.map(key => {
                     const validScores = data.map(r => parseFloat(r[key])).filter(v => !isNaN(v));
                     return validScores.length ? validScores.reduce((a, b) => a + b, 0) / validScores.length : 0;
                });
            }
            
            // 智能判断数据类型
            const maxVal = Math.max(...rawValues);
            let displayValues = rawValues;
            let yAxisName = '得分率(%)';
            let yAxisMax = 100;
            let tooltipFormatter = '{c}%';

            if (maxVal <= 1) {
                // 情况1: 0-1 小数 (如 0.85) -> 转换为百分比
                displayValues = rawValues.map(v => parseFloat((v * 100).toFixed(2)));
                yAxisName = '得分率(%)';
                yAxisMax = 100;
                tooltipFormatter = '{c}%';
            } else if (maxVal <= 20) {
                // 情况2: 可能是题目原始平均分 -> 显示原始分
                displayValues = rawValues.map(v => parseFloat(v.toFixed(2)));
                yAxisName = '平均得分';
                yAxisMax = undefined as any; 
                tooltipFormatter = '{c}分';
            } else {
                // 情况3: 0-100 数值 -> 直接显示
                displayValues = rawValues.map(v => parseFloat(v.toFixed(2)));
                yAxisName = '得分率(%)';
                yAxisMax = 100;
                tooltipFormatter = '{c}%';
            }

            chart.setOption({
                title: { text: '班级各题数据概览', left: 'center' },
                tooltip: { trigger: 'axis' },
                xAxis: { type: 'category', data: questions, boundaryGap: false }, // boundaryGap: false for line chart start from axis
                yAxis: { type: 'value', max: yAxisMax, name: yAxisName },
                series: [{
                    type: 'line',
                    smooth: true,
                    symbol: 'circle',
                    symbolSize: 8,
                    data: displayValues,
                    itemStyle: { color: '#4285F4' },
                    lineStyle: { width: 3 },
                    label: { show: true, position: 'top', formatter: tooltipFormatter },
                    areaStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(66, 133, 244, 0.5)' },
                            { offset: 1, color: 'rgba(66, 133, 244, 0.1)' }
                        ])
                    }
                }]
            });

        } else {
            // 绘制学生数据的热力图
            const studentIds = data.slice(0, 30).map((row, idx) => row['student_id'] || row['姓名'] || `S${idx+1}`);
            const allKeys = Object.keys(data[0]);
            const questionKeys = allKeys.filter(k => k !== 'student_id' && k !== '姓名' && k !== '学号' && k !== 'name');
            
            const heatmapData: any[] = [];
            let globalMaxScore = 0; // Find max score for dynamic visualMap

            data.slice(0, 30).forEach((row, sIdx) => {
                questionKeys.forEach((qKey, qIdx) => {
                    let val = parseFloat(row[qKey]);
                    if (isNaN(val)) val = 0;
                    heatmapData.push([qIdx, sIdx, val]);
                    if (val > globalMaxScore) globalMaxScore = val;
                });
            });

            // Fallback if max is 0 (empty data)
            if (globalMaxScore === 0) globalMaxScore = 10;

            chart.setOption({
                title: { text: '班级得分分布热力图 (前30名学生)', left: 'center' },
                tooltip: { position: 'top' },
                grid: { height: '70%', top: '15%' },
                xAxis: { type: 'category', data: questionKeys, splitArea: { show: true } },
                yAxis: { type: 'category', data: studentIds, splitArea: { show: true } },
                visualMap: {
                    min: 0,
                    max: Math.ceil(globalMaxScore), // Dynamic max
                    calculable: true,
                    orient: 'horizontal',
                    left: 'center',
                    bottom: '0%'
                },
                series: [{
                    name: '得分',
                    type: 'heatmap',
                    data: heatmapData,
                    label: { show: true },
                    emphasis: {
                        itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.5)' }
                    }
                }]
            });
        }

        const resizeHandler = () => chart.resize();
        window.addEventListener('resize', resizeHandler);
        return () => {
            window.removeEventListener('resize', resizeHandler);
            chart.dispose();
        };
    }, [data, mode]);

    return (
        <Card variant="outlined" sx={{ mb: 4 }}>
            <CardContent>
                <div ref={chartRef} style={{ width: '100%', height: '500px' }} />
            </CardContent>
        </Card>
    );
};

// --- 自定义 Markdown 组件 (用于美化报告展示) ---

// Markdown 组件映射：将 Markdown 语法转换为美观的 MUI 组件
const markdownComponents = {
    // 一级标题：使用大号字体，带星号图标和下划线
    h1: ({ children }: any) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 4, mb: 2, pb: 1, borderBottom: '2px solid #1976d2' }}>
            <StarIcon color="primary" fontSize="large" />
            <Typography variant="h4" color="primary" sx={{ fontWeight: 'bold' }}>
                {children}
            </Typography>
        </Box>
    ),
    // 二级标题：使用中号字体，带时间轴图标，区分章节
    h2: ({ children }: any) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 3, mb: 1.5 }}>
            <TimelineIcon color="secondary" />
            <Typography variant="h5" color="text.primary" sx={{ fontWeight: 'bold' }}>
                {children}
            </Typography>
        </Box>
    ),
    // 三级标题：小标题，带圆点装饰
    h3: ({ children }: any) => (
        <Typography variant="h6" color="text.secondary" gutterBottom sx={{ mt: 2, mb: 1, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box component="span" sx={{ width: 8, height: 8, bgcolor: 'secondary.main', borderRadius: '50%', display: 'inline-block' }} />
            {children}
        </Typography>
    ),
    // 正文段落：增加行高，提升阅读体验
    p: ({ children }: any) => (
        <Typography variant="body1" component="div" sx={{ mb: 2, lineHeight: 1.7, color: '#444' }}>
            {children}
        </Typography>
    ),
    // 引用块：使用蓝色背景框，带灯泡图标，用于高亮重要建议
    blockquote: ({ children }: any) => (
        <Alert severity="info" variant="outlined" icon={<LightbulbIcon />} sx={{ my: 2, borderRadius: 2, bgcolor: '#f0f7ff', border: '1px solid #bbdefb' }}>
            <Typography variant="body2" component="div" sx={{ fontStyle: 'italic', color: '#0d47a1' }}>
                {children}
            </Typography>
        </Alert>
    ),
    // 表格容器：添加圆角和阴影
    table: ({ children }: any) => (
        <TableContainer component={Paper} variant="outlined" sx={{ my: 2, borderRadius: 2, overflow: 'hidden', boxShadow: 1 }}>
            <Table size="small">
                {children}
            </Table>
        </TableContainer>
    ),
    thead: ({ children }: any) => <TableHead sx={{ bgcolor: '#e3f2fd' }}>{children}</TableHead>,
    tbody: ({ children }: any) => <TableBody>{children}</TableBody>,
    tr: ({ children }: any) => <TableRow hover>{children}</TableRow>,
    th: ({ children }: any) => (
        <TableCell sx={{ fontWeight: 'bold', color: '#1565c0' }}>{children}</TableCell>
    ),
    td: ({ children }: any) => <TableCell>{children}</TableCell>,
    // 列表项
    li: ({ children }: any) => (
        <Box component="li" sx={{ mb: 0.5, typography: 'body1', color: '#444' }}>
            {children}
        </Box>
    ),
    // 代码块：行内代码高亮，块级代码使用黑色背景
    code: ({ inline, className, children, ...props }: any) => {
        if (inline) {
            return (
                <Box component="span" sx={{ bgcolor: '#f5f5f5', px: 0.8, py: 0.2, borderRadius: 1, fontFamily: 'monospace', fontSize: '0.9em', color: '#d32f2f', fontWeight: 'bold' }} {...props}>
                    {children}
                </Box>
            );
        }
        return (
            <Box component="pre" sx={{ bgcolor: '#282c34', color: '#abb2bf', p: 2, borderRadius: 2, overflowX: 'auto', my: 2, fontSize: '0.875rem' }}>
                <code className={className} {...props}>{children}</code>
            </Box>
        );
    }
};

// --- Structured Recommendation Components ---

const WeaknessCardItem = ({ item, mode, onGenerateVariant, questions }: { item: any, mode: 'class' | 'student', onGenerateVariant?: (item: any) => void, questions?: any[] }) => {
    const [expanded, setExpanded] = useState(false);
    
    // Class Mode Fields: 题号, 难度等级, 核心能力要素, 得分率, 问题诊断, 教学建议, 推荐训练题型, 变式训练思路
    // Student Mode Fields: 题号, 错误类型, 根本原因, 纠正建议, 推荐复习题型, 变式训练建议
    
    const qIdRaw = item["题号"];
    let displayTitle = qIdRaw ? `题目 ${qIdRaw}` : "未知题目";
    
    // Resolve Original ID if Q-index based
    if (qIdRaw && questions) {
         const qIdStr = String(qIdRaw).trim();
         const qMatch = qIdStr.match(/Q(\d+)/i);
         if (qMatch && qMatch[1]) {
             const index = parseInt(qMatch[1]) - 1;
             if (index >= 0 && index < questions.length) {
                 const originalId = questions[index].meta?.original_id || questions[index].id;
                 displayTitle = `题目 ${qIdRaw} (原题号: ${originalId})`;
             }
         }
    }
    
    // Extract Q number for avatar
    const qNum = item["题号"] ? String(item["题号"]).replace(/[^\d]/g, '') : '?';

    const diagnosis = mode === 'class' ? item["问题诊断"] : item["根本原因"];
    const suggestion = mode === 'class' ? item["教学建议"] : item["纠正建议"];
    
    const recommendedQuestions = mode === 'class' ? item["推荐训练题型"] : item["推荐复习题型"];
    const variantIdea = mode === 'class' ? item["变式训练思路"] : item["变式训练建议"];

    // Tags
    const tags = mode === 'class' ? (item["核心能力要素"] || []) : [item["错误类型"]];

    return (
        <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column', borderColor: '#e0e0e0', transition: 'box-shadow 0.3s', '&:hover': { boxShadow: 3 } }}>
            <Box sx={{ p: 2, display: 'flex', gap: 2 }}>
                <Avatar sx={{ bgcolor: mode === 'class' ? '#4285F4' : '#EA4335', width: 40, height: 40, fontSize: '1rem' }}>
                    {qNum || '?'}
                </Avatar>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
                        <Typography variant="subtitle1" fontWeight="bold" noWrap title={displayTitle}>
                            {displayTitle}
                        </Typography>
                        {mode === 'class' && (
                            <Chip 
                                label={item["难度等级"] || 'Lx'} 
                                size="small" 
                                color={item["难度等级"] === 'L5' || item["难度等级"] === 'L4' ? 'error' : 'default'}
                                sx={{ height: 20, fontSize: '0.75rem' }}
                            />
                        )}
                    </Box>
                    
                    {mode === 'class' && (
                         <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            得分率: <Box component="span" sx={{ fontWeight: 'bold', color: '#1976d2' }}>{item["得分率"]}</Box>
                         </Typography>
                    )}

                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                         {tags.map((tag: string, idx: number) => (
                             tag && <Chip key={idx} label={tag} size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 20, mb: 0.5 }} />
                         ))}
                    </Stack>
                </Box>
            </Box>

            <Divider />
            <CardContent sx={{ flexGrow: 1, py: 1.5 }}>
                <Typography variant="caption" color="text.secondary" fontWeight="bold">
                   {mode === 'class' ? '问题诊断' : '错误原因'}
                </Typography>
                <Typography variant="body2" paragraph sx={{ mt: 0.5, mb: 1.5, fontSize: '0.875rem' }}>
                    {diagnosis || "暂无诊断"}
                </Typography>
                
                <Box sx={{ bgcolor: '#f0f7ff', p: 1, borderRadius: 1 }}>
                    <Typography variant="caption" color="primary" fontWeight="bold">
                        {mode === 'class' ? '💡 教学建议' : '💡 纠正建议'}
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.5, fontSize: '0.875rem' }}>
                        {suggestion || "暂无建议"}
                    </Typography>
                </Box>
            </CardContent>
            
            <CardActions disableSpacing sx={{ bgcolor: '#fafafa', px: 2, borderTop: '1px solid #f0f0f0' }}>
                <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#666' }}>
                    查看推荐题型与变式
                </Typography>
                <Box sx={{ flexGrow: 1 }} />
                
                {/* Variant Generation Button */}
                <Tooltip title="AI生成变式训练题">
                    <IconButton size="small" color="secondary" onClick={() => onGenerateVariant && onGenerateVariant(item)} sx={{ mr: 1 }}>
                        <AutoFixHighIcon fontSize="small" />
                    </IconButton>
                </Tooltip>

                <IconButton 
                    onClick={() => setExpanded(!expanded)}
                    size="small"
                >
                    <ExpandMoreIcon sx={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: '0.3s' }} />
                </IconButton>
            </CardActions>
            
            <Collapse in={expanded} timeout="auto" unmountOnExit>
                <CardContent sx={{ bgcolor: '#fafafa', pt: 0, borderTop: '1px dashed #e0e0e0' }}>
                    {recommendedQuestions && recommendedQuestions.length > 0 && (
                        <Box sx={{ mt: 2, mb: 2 }}>
                            <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                                🎯 推荐题型:
                            </Typography>
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                {recommendedQuestions.map((q: string, i: number) => (
                                    <Chip 
                                        key={i} 
                                        icon={<AssignmentIcon style={{ fontSize: 14 }} />} 
                                        label={q} 
                                        size="small" 
                                        color="primary" 
                                        variant="outlined" 
                                        sx={{ mb: 0.5 }}
                                    />
                                ))}
                            </Stack>
                        </Box>
                    )}
                    
                    {variantIdea && (
                        <Box sx={{ mt: 1 }}>
                            <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                                🔄 {mode === 'class' ? '变式训练思路:' : '变式训练建议:'}
                            </Typography>
                            <Alert severity="success" icon={false} sx={{ py: 0.5, px: 1.5, '& .MuiAlert-message': { fontSize: '0.8rem' } }}>
                                {variantIdea}
                            </Alert>
                        </Box>
                    )}
                </CardContent>
            </Collapse>
        </Card>
    );
};

const WeaknessCards = ({ result, mode, onDownloadMD, onDownloadPDF, onGenerateVariant, onGenerateRemedial, questions }: { 
    result: any, 
    mode: 'class' | 'student',
    onDownloadMD?: () => void,
    onDownloadPDF?: () => void,
    onGenerateVariant?: (item: any) => void,
    onGenerateRemedial?: () => void,
    questions?: any[]
}) => {
    // Extract weakness items based on mode
    let items: any[] = [];
    
    if (mode === 'class') {
        items = result["能力短板诊断"] || [];
    } else {
        items = result["错题分析"] || [];
    }
    
    if (!items || items.length === 0) return null;

    return (
        <Box sx={{ mt: 4 }} id="weakness-cards-container">
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#1976d2', fontWeight: 'bold', mb: 0 }}>
                    <LightbulbIcon color="warning" />
                    {mode === 'class' ? '薄弱点智能诊断与训练建议' : '错题深度诊断与个性化提升'}
                </Typography>
                <Stack direction="row" spacing={1}>
                    {onGenerateRemedial && (
                         <Button 
                             variant="contained" 
                             color="secondary" 
                             startIcon={<AutoFixHighIcon />} 
                             size="small" 
                             onClick={onGenerateRemedial}
                             sx={{ fontWeight: 'bold', boxShadow: 2 }}
                         >
                             一键生成补救试卷
                         </Button>
                    )}
                    {onDownloadMD && (
                        <Button variant="outlined" startIcon={<DownloadIcon />} size="small" onClick={onDownloadMD}>
                            .md
                        </Button>
                    )}
                    {onDownloadPDF && (
                        <Button variant="outlined" startIcon={<DownloadIcon />} size="small" onClick={onDownloadPDF}>
                            .pdf
                        </Button>
                    )}
                </Stack>
            </Box>
            <Grid container spacing={2}>
                {items.map((item, idx) => (
                    <Grid item xs={12} md={6} lg={4} key={idx}>
                        <WeaknessCardItem item={item} mode={mode} onGenerateVariant={onGenerateVariant} questions={questions} />
                    </Grid>
                ))}
            </Grid>
        </Box>
    );
};

interface AnalysisSessionState {
    file: File | null;
    scoreData: any[];
    previewData: any[];
    fullScores: Record<string, number>;
    tasks: TaskInfo[];
    selectedResultId: string | null;
    analyzing: boolean;
    analysisStartTime: number | null;
}

const initialSessionState: AnalysisSessionState = {
    file: null,
    scoreData: [],
    previewData: [],
    fullScores: {},
    tasks: [],
    selectedResultId: null,
    analyzing: false,
    analysisStartTime: null
};

export const ScoreAnalysisView: React.FC<ScoreAnalysisViewProps> = ({ questions, modelConfigs }) => {
    // const [selectedConfigId, setSelectedConfigId] = useState<number>(modelConfigs.length > 0 ? modelConfigs[0].id : 1);
    
    // const selectedConfig = useMemo(() => 
    //     modelConfigs.find(c => c.id === selectedConfigId) || modelConfigs[0]
    // , [modelConfigs, selectedConfigId]);

    const [mode, setMode] = useState<'class' | 'student'>('class');

    // Variant Generation State
    const [variantDialogOpen, setVariantDialogOpen] = useState(false);
    const [variantLoading, setVariantLoading] = useState(false);
    const [variantResult, setVariantResult] = useState<any>(null);
    const [variantError, setVariantError] = useState<string | null>(null);

    // Remedial Paper State
    const [remedialOpen, setRemedialOpen] = useState(false);
    const [remedialGenerating, setRemedialGenerating] = useState(false);
    const [remedialProgress, setRemedialProgress] = useState(0);
    const [remedialResults, setRemedialResults] = useState<any[]>([]);
    const [remedialTab, setRemedialTab] = useState(0); // 0: Question Paper, 1: Answer Key

    // Independent session states
    const [classSession, setClassSession] = useState<AnalysisSessionState>(initialSessionState);
    const [studentSession, setStudentSession] = useState<AnalysisSessionState>(initialSessionState);

    // Derived current session
    const currentSession = mode === 'class' ? classSession : studentSession;
    const setSession = (updater: AnalysisSessionState | ((prev: AnalysisSessionState) => AnalysisSessionState)) => {
        if (mode === 'class') {
            setClassSession(prev => typeof updater === 'function' ? updater(prev) : updater);
        } else {
            setStudentSession(prev => typeof updater === 'function' ? updater(prev) : updater);
        }
    };

    // State Accessors (for backward compatibility)
    const file = currentSession.file;
    const scoreData = currentSession.scoreData;
    const previewData = currentSession.previewData;
    const fullScores = currentSession.fullScores;
    const tasks = currentSession.tasks;
    const selectedResultId = currentSession.selectedResultId;
    const analyzing = currentSession.analyzing;
    const analysisStartTime = currentSession.analysisStartTime;

    // State Setters (wrapped to update current session)
    const setFile = (f: File | null) => setSession(prev => ({ ...prev, file: f }));
    const setScoreData = (d: any[]) => setSession(prev => ({ ...prev, scoreData: d }));
    const setPreviewData = (d: any[]) => setSession(prev => ({ ...prev, previewData: d }));
    const setFullScores = (valOrUpdater: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => {
        setSession(prev => ({
            ...prev,
            fullScores: typeof valOrUpdater === 'function' ? valOrUpdater(prev.fullScores) : valOrUpdater
        }));
    };
    const setTasks = (valOrUpdater: TaskInfo[] | ((prev: TaskInfo[]) => TaskInfo[])) => {
        setSession(prev => ({
            ...prev,
            tasks: typeof valOrUpdater === 'function' ? valOrUpdater(prev.tasks) : valOrUpdater
        }));
    };
    const setSelectedResultId = (id: string | null) => setSession(prev => ({ ...prev, selectedResultId: id }));
    const setAnalyzing = (b: boolean) => setSession(prev => ({ ...prev, analyzing: b }));
    const setAnalysisStartTime = (t: number | null) => setSession(prev => ({ ...prev, analysisStartTime: t }));

    const [uploading, setUploading] = useState(false);
    const [activeModelTab, setActiveModelTab] = useState<number>(0); // Store configId
    const [helpOpen, setHelpOpen] = useState(false);
    
    // 元数据覆盖状态: qId -> modelLabel -> fields
    // 用于存储用户在界面上手动修正的题目元数据（难度、主题、能力）
    const [metaOverrides, setMetaOverrides] = useState<Record<string, Record<string, { 
        framework_topic: string, 
        ability_elements: string,
        difficulty: string 
    }>>>({});
    const [metaAccordionExpanded, setMetaAccordionExpanded] = useState(false);

    // 初始化/同步元数据覆盖状态
    // 当题目或模型配置变化时，自动填充初始值，确保每个模型都有独立的数据副本
    useEffect(() => {
        if (questions.length === 0) return;
        
        setMetaOverrides(prev => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const newOverrides: any = { ...prev };
            let hasChanges = false;

            questions.forEach(q => {
                if (!newOverrides[q.id]) newOverrides[q.id] = {};

                modelConfigs.forEach(config => {
                    const modelLabel = config.label;
                    // 获取当前已存在的覆盖数据（如果之前初始化过）
                    const existing = newOverrides[q.id][modelLabel];
                    
                    // 准备新的值容器
                    let nextValues = existing ? { ...existing } : { 
                        framework_topic: '', 
                        ability_elements: '', 
                        difficulty: '' 
                    };
                    let needsUpdate = false;

                    // 如果当前没有覆盖数据，或者覆盖数据中的字段为空，尝试从 analysis 中获取
                    if (q.analysis && q.analysis[modelLabel]) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const result = q.analysis[modelLabel] as any;
                        const meta = result.meta || result; // 处理不同的数据结构变体
                        
                        // 1. 尝试获取并填充主题
                        const extractedTopic = meta.framework_topic || meta.knowledge_topic || meta.topic || meta.theme || '';
                        if (!nextValues.framework_topic && extractedTopic) {
                            nextValues.framework_topic = extractedTopic;
                            needsUpdate = true;
                        }

                        // 2. 尝试获取并填充能力要素
                        const abs = meta.ability_elements || meta.abilities || meta.ability;
                        const extractedAbility = Array.isArray(abs) ? abs.join(',') : (abs || '');
                        if (!nextValues.ability_elements && extractedAbility) {
                            nextValues.ability_elements = extractedAbility;
                            needsUpdate = true;
                        }
                        
                        // 3. 尝试获取并填充难度评级
                        const extractedDifficulty = result.final_level || result.comprehensive_rating?.final_level || '';
                        if (!nextValues.difficulty && extractedDifficulty) {
                            nextValues.difficulty = extractedDifficulty;
                            needsUpdate = true;
                        }
                    }

                    // 如果是全新初始化 (!existing) 或者 发现了新数据需要更新 (needsUpdate)
                    if (!existing || needsUpdate) {
                        newOverrides[q.id][modelLabel] = nextValues;
                        hasChanges = true;
                    }
                });
            });

            return hasChanges ? newOverrides : prev;
        });
    }, [questions, modelConfigs]);

    const handleMetaChange = (qId: string, modelLabel: string, field: 'framework_topic' | 'ability_elements' | 'difficulty', value: string) => {
        setMetaOverrides(prev => ({
            ...prev,
            [qId]: {
                ...prev[qId],
                [modelLabel]: {
                    ...(prev[qId]?.[modelLabel] || { framework_topic: '', ability_elements: '', difficulty: '' }),
                    [field]: value
                }
            }
        }));
    };

    const fileInputRef = useRef<HTMLInputElement>(null);

    // --- Upload Handler ---
    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            const selectedFile = event.target.files[0];
            
            // 1. 扩展名校验
            const fileName = selectedFile.name.toLowerCase();
            if (!fileName.endsWith('.csv') && !fileName.endsWith('.xlsx')) {
                alert("文件格式错误：仅支持 .csv 或 .xlsx 格式文件");
                event.target.value = ''; // Reset input
                return;
            }

            // 2. 大小校验 (10MB)
            if (selectedFile.size > 10 * 1024 * 1024) {
                alert("文件大小错误：文件不能超过 10MB");
                event.target.value = '';
                return;
            }

            setFile(selectedFile);
            setScoreData([]);
            setPreviewData([]);
            setTasks([]);
        }
    };

    const handleUpload = async () => {
        if (!file) return;
        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('mode', mode);

        try {
            const response = await axios.post('http://127.0.0.1:8000/api/score/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            // Backend returns { data: [...], count: N, columns: [...], full_scores: {...} }
            let parsedData = response.data.data;
            let fullScoresRaw = response.data.full_scores || {};
            let remappedFullScores: Record<string, number> = {};
            
            // --- Normalization Logic: Unify Question IDs to Q1, Q2... ---
            if (parsedData.length > 0) {
                // Heuristic to detect Class Mode (Aggregated) vs Student Mode (Raw)
                // Class mode usually has 'question_id' or '题号' column
                const isClassMode = parsedData[0].hasOwnProperty('question_id') || parsedData[0].hasOwnProperty('题号');
                
                if (isClassMode) {
                    // Class Mode: Each row is a question.
                    // We enforce Q1, Q2... based on row order to match Metadata order.
                    parsedData = parsedData.map((row: any, idx: number) => ({
                        ...row,
                        question_id: `Q${idx + 1}`,
                        '题号': `Q${idx + 1}`
                    }));
                } else {
                    // Student Mode: Each row is a student, columns are questions.
                    // Identify question columns and rename them to Q1, Q2...
                    const firstRow = parsedData[0];
                    const keys = Object.keys(firstRow);
                    const nonQKeys = ['student_id', 'name', '姓名', '学号', 'class', '班级', 'rank', '排名'];
                    
                    // Filter and sort/preserve order of question keys
                    // We assume the file columns are in correct order relative to metadata
                    const qKeys = keys.filter(k => !nonQKeys.includes(k));
                    
                    // Create mapping
                    const keyMap: Record<string, string> = {};
                    qKeys.forEach((key, idx) => {
                        const newKey = `Q${idx + 1}`;
                        keyMap[key] = newKey;
                        
                        // Map full scores using the same key
                        if (fullScoresRaw[key] !== undefined) {
                            remappedFullScores[newKey] = fullScoresRaw[key];
                        }
                    });
                    
                    parsedData = parsedData.map((row: any) => {
                        const newRow: any = {};
                        // Preserve non-question keys as is, map question keys
                        Object.keys(row).forEach(k => {
                            if (keyMap[k]) {
                                newRow[keyMap[k]] = row[k];
                            } else {
                                newRow[k] = row[k];
                            }
                        });
                        return newRow;
                    });
                }
            }

            setScoreData(parsedData);
            setPreviewData(parsedData); // Use same data for preview for now
            setFullScores(remappedFullScores);
            alert(`上传成功！解析到 ${response.data.count} 条数据。\n已自动将题号映射为系统标准格式 (Q1, Q2...)`);
        } catch (error: any) {
            console.error("Upload failed", error);
            const msg = error.response?.data?.detail || error.message || "Unknown error";
            alert("Upload failed: " + msg);
        } finally {
            setUploading(false);
        }
    };

    // --- Retry Handler ---
    const handleRetryTask = async (failedTask: TaskInfo) => {
        const config = modelConfigs.find(c => c.id === failedTask.configId);
        if (!config) {
            alert("找不到对应的模型配置，无法重试。");
            return;
        }

        let targetScoreData = scoreData;
        // 如果是特定学生的任务（非全班分析且非概览），筛选对应数据
        if (failedTask.id !== 'class_analysis' && failedTask.id !== 'overview') {
            targetScoreData = scoreData.filter(s => 
                (s.student_id === failedTask.id) || 
                (s['姓名'] === failedTask.id) || 
                (s['学号'] === failedTask.id)
            );
            
            if (targetScoreData.length === 0) {
                 alert(`无法找到对象 ${failedTask.id} 的数据，无法重试。`);
                 return;
            }
        }

        // 重新构建该模型的题目上下文（应用元数据覆盖）
        const modelSpecificQuestions = questions.map((q, idx) => {
            const analysisResult = q.analysis?.[config.label];
            const override = metaOverrides[q.id]?.[config.label];
            
            let overrideAbilities: string[] | undefined = undefined;
            if (override?.ability_elements) {
                overrideAbilities = String(override.ability_elements)
                    .replace(/，/g, ',')
                    .split(',')
                    .map(s => s.trim())
                    .filter(s => s);
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const baseQ: any = { ...q };
            
            const systemId = `Q${idx + 1}`;
            if (!baseQ.meta) baseQ.meta = {};
            baseQ.meta.original_id = baseQ.id;
            baseQ.id = systemId;
            (baseQ as any)['题号'] = systemId;
            
            if (analysisResult) {
                Object.assign(baseQ, analysisResult);
            }

            if (override) {
                if (override.framework_topic) {
                    (baseQ as any).framework_topic = override.framework_topic;
                    (baseQ as any).knowledge_topic = override.framework_topic;
                    if (!(baseQ as any).meta) (baseQ as any).meta = {};
                    (baseQ as any).meta.framework_topic = override.framework_topic;
                    (baseQ as any).meta.knowledge_topic = override.framework_topic;
                }
                if (overrideAbilities) {
                    (baseQ as any).ability_elements = overrideAbilities;
                    if (!(baseQ as any).meta) (baseQ as any).meta = {};
                    (baseQ as any).meta.ability_elements = overrideAbilities;
                }
                if (override.difficulty) {
                     (baseQ as any).final_level = override.difficulty;
                     if ((baseQ as any).comprehensive_rating) {
                         (baseQ as any).comprehensive_rating.final_level = override.difficulty;
                     } else {
                         (baseQ as any).comprehensive_rating = { final_level: override.difficulty };
                     }
                }
            }
            return baseQ;
        });

        // 更新状态为 pending
        setTasks(prev => prev.map(t => {
            if (t.taskId === failedTask.taskId) {
                return { ...t, status: 'pending', error: undefined };
            }
            return t;
        }));
        setAnalyzing(true);

        try {
            const response = await axios.post('http://127.0.0.1:8000/api/score/analyze', {
                score_data: targetScoreData,
                question_data: modelSpecificQuestions,
                mode: mode,
                config: {
                    ...config,
                    provider: config.provider,
                    api_key: config.apiKey,
                    base_url: config.baseUrl,
                    model_name: config.modelName,
                    temperature: config.temperature
                }
            });

            const newTasksRaw = response.data.tasks;
            if (newTasksRaw.length > 0) {
                const newTaskRaw = newTasksRaw[0];
                setTasks(prev => prev.map(t => {
                    if (t.taskId === failedTask.taskId) {
                         return {
                            ...t,
                            taskId: newTaskRaw.task_id,
                            status: 'pending'
                         };
                    }
                    return t;
                }));
            }
        } catch (error: any) {
            console.error("Retry failed", error);
            const msg = error.response?.data?.detail || error.message || "Retry failed";
            setTasks(prev => prev.map(t => {
                if (t.taskId === failedTask.taskId) {
                    return { ...t, status: 'failure', error: msg };
                }
                return t;
            }));
        }
    };

    // --- Analysis Handler ---
    const handleStartAnalysis = async () => {
        if (scoreData.length === 0 || questions.length === 0) return;
        setAnalyzing(true);
        setAnalysisStartTime(Date.now());
        setTasks([]);
        setSelectedResultId(null);

        try {
            // const allNewTasks: TaskInfo[] = [];

            // 多模型并发分析
            const analysisPromises = modelConfigs.map(async (config) => {
                // 准备模型特定的题目上下文
                // 提取当前模型对应的修正数据（难度、主题等）并合并到题目对象中
                const modelSpecificQuestions = questions.map((q, idx) => {
                    const analysisResult = q.analysis?.[config.label];
                    const override = metaOverrides[q.id]?.[config.label];
                    
                    // 解析能力要素字符串（处理中文逗号）
                    let overrideAbilities: string[] | undefined = undefined;
                    if (override?.ability_elements) {
                        overrideAbilities = String(override.ability_elements)
                            .replace(/，/g, ',') // 处理中文逗号
                            .split(',')
                            .map(s => s.trim())
                            .filter(s => s);
                    }

                    // 创建基础题目对象的副本
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const baseQ: any = { ...q };
                    
                    // --- 强制系统ID ---
                    // 确保ID与归一化后的分数据（Q1, Q2...）匹配
                    // 这对于将分数数据与题目元数据对应至关重要
                    const systemId = `Q${idx + 1}`;
                    
                    // 在元数据中保存原始ID
                    if (!baseQ.meta) baseQ.meta = {};
                    baseQ.meta.original_id = baseQ.id;

                    // 覆盖用于分析上下文的ID
                    baseQ.id = systemId;
                    (baseQ as any)['题号'] = systemId;
                    
                    if (analysisResult) {
                        Object.assign(baseQ, analysisResult);
                    }

                    // 应用修正数据 (同时注入到顶层和meta中，确保后端能正确读取)
                    if (override) {
                        if (override.framework_topic) {
                            (baseQ as any).framework_topic = override.framework_topic;
                            (baseQ as any).knowledge_topic = override.framework_topic; // 映射到常用的两个键名
                            if (!(baseQ as any).meta) (baseQ as any).meta = {};
                            (baseQ as any).meta.framework_topic = override.framework_topic;
                            (baseQ as any).meta.knowledge_topic = override.framework_topic;
                        }
                        if (overrideAbilities) {
                            (baseQ as any).ability_elements = overrideAbilities;
                            if (!(baseQ as any).meta) (baseQ as any).meta = {};
                            (baseQ as any).meta.ability_elements = overrideAbilities;
                        }
                        if (override.difficulty) {
                             (baseQ as any).final_level = override.difficulty;
                             if ((baseQ as any).comprehensive_rating) {
                                 (baseQ as any).comprehensive_rating.final_level = override.difficulty;
                             } else {
                                 (baseQ as any).comprehensive_rating = { final_level: override.difficulty };
                             }
                        }
                    }

                    return baseQ;
                });

                const response = await axios.post('http://127.0.0.1:8000/api/score/analyze', {
                    score_data: scoreData,
                    question_data: modelSpecificQuestions,
                    mode: mode,
                    config: {
                        ...config,
                        provider: config.provider,
                        api_key: config.apiKey,
                        base_url: config.baseUrl,
                        model_name: config.modelName,
                        temperature: config.temperature
                    }
                });

                return response.data.tasks.map((t: any) => ({
                    id: t.id,
                    modelLabel: getModelDisplayLabel(config),
                    configId: config.id,
                    taskId: t.task_id,
                    status: 'pending' as const
                }));
            });

            // Update tasks as they are dispatched to support immediate pending state UI
            // const allNewTasks: TaskInfo[] = [];
            
            // Wait for all dispatches but update state incrementally if possible (though Promise.all waits)
            // To update immediately per model, we should not use Promise.all to wait for everything before setting state.
            // But we need to collect all for polling.
            // Improved approach: Add to state as soon as dispatched.
            
            analysisPromises.forEach(p => {
                p.then(newTasks => {
                    setTasks(prev => {
                        // Merge new tasks to avoid duplicates if any retry logic exists (though simple append is fine here)
                        const combined = [...prev, ...newTasks];
                        // Remove duplicates by taskId just in case
                        return combined.filter((v, i, a) => a.findIndex(t => t.taskId === v.taskId) === i);
                    });
                }).catch(e => console.error("Dispatch error for a model", e));
            });
            
            // We still wait for all to ensure we catch any major setup errors, 
            // but the UI will update via the individual promise resolutions above.
            await Promise.all(analysisPromises);
            
            if (modelConfigs.length > 0) {
                setActiveModelTab(modelConfigs[0].id);
            }

        } catch (error: any) {
            console.error("Analysis start failed", error);
            alert("Analysis failed to start: " + (error.response?.data?.detail || error.message));
            setAnalyzing(false);
        }
    };

    const handleStopAnalysis = async () => {
        if (tasks.length === 0) return;
        
        // Optimistically update UI immediately
        setAnalyzing(false);
        setTasks(prev => prev.map(t => {
            if (t.status === 'pending' || t.status === 'processing') {
                return { ...t, status: 'failure', error: '用户终止分析' };
            }
            return t;
        }));

        try {
            // Extract all task IDs that are running
            const runningTaskIds = tasks
                .filter(t => t.status === 'pending' || t.status === 'processing')
                .map(t => t.taskId);
                
            // Always call stop to purge backend queue, even if no tasks are tracked as running
            await axios.post('http://127.0.0.1:8000/api/tasks/stop', runningTaskIds);
        } catch (error) {
            console.error("Failed to stop analysis", error);
            // alert("停止分析失败，请重试"); // Suppress alert for better UX on stop
        }
    };

    // --- Polling Logic ---
    useEffect(() => {
        if (tasks.length === 0) return;
        
        const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'processing');
        if (pendingTasks.length === 0) {
            setAnalyzing(false);
            return;
        }

        const intervalId = setInterval(async () => {
            const updatedTasks = [...tasks];
            let changed = false;

            for (let i = 0; i < updatedTasks.length; i++) {
                const task = updatedTasks[i];
                if (task.status === 'success' || task.status === 'failure') continue;
                
                try {
                    const res = await axios.get(`http://127.0.0.1:8000/api/tasks/${task.taskId}`);
                    const status = res.data.status; // PENDING, PROCESSING, SUCCESS, FAILURE
                    
                    if (status === 'SUCCESS') {
                        // Check if the result actually contains an application-level error
                        if (res.data.result && res.data.result.error) {
                            updatedTasks[i] = { ...task, status: 'failure', error: res.data.result.error };
                        } else {
                            updatedTasks[i] = { ...task, status: 'success', result: res.data.result };
                        }
                        changed = true;
                    } else if (status === 'FAILURE') {
                        updatedTasks[i] = { ...task, status: 'failure', error: res.data.error || "任务执行失败" };
                        changed = true;
                    } else if (status !== 'PENDING' && status !== 'PROCESSING') {
                        // Handle revoked or other unknown states
                         updatedTasks[i] = { ...task, status: 'failure', error: `未知状态: ${status}` };
                         changed = true;
                    } else if (task.status === 'pending' && status === 'PROCESSING') {
                         updatedTasks[i] = { ...task, status: 'processing' };
                         changed = true;
                    }
                } catch (e) {
                    console.error("Poll error for task", task.taskId, e);
                    // Do not mark as failed immediately on network error, just retry next poll
                }
            }

            if (changed) {
                setTasks(updatedTasks);
            }
            
            // Only stop analyzing if NO tasks are pending/processing AND we've completed a full pass
            const stillPending = updatedTasks.some(t => t.status === 'pending' || t.status === 'processing');
            if (!stillPending) {
                setAnalyzing(false);
            }

        }, 3000); // Increase interval slightly to reduce load

        return () => clearInterval(intervalId);
    }, [tasks]);

    // --- Visualization Helpers ---
    const [now, setNow] = useState(Date.now()); // Force update for timer
    const [avgTimePerTask, setAvgTimePerTask] = useState<number>(0);

    // Update 'now' every second to refresh timer
    useEffect(() => {
        if (!analyzing) return;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [analyzing]);

    const completedCount = tasks.filter(t => t.status === 'success' || t.status === 'failure').length;
    const progress = tasks.length > 0 ? (completedCount / tasks.length) * 100 : 0;

    // Update average time per task when a task completes
    useEffect(() => {
        if (completedCount > 0 && analysisStartTime) {
            // Use current time as the "completion time" for the latest batch
            const elapsed = (Date.now() - analysisStartTime) / 1000;
            setAvgTimePerTask(elapsed / completedCount);
        } else if (completedCount === 0) {
            setAvgTimePerTask(0);
        }
    }, [completedCount, analysisStartTime]);
    
    // Estimate remaining time
    const estimatedTimeRemaining = useMemo(() => {
        if (!analysisStartTime) return null;
        if (completedCount === tasks.length && tasks.length > 0) return null;
        
        // Show "Calculating..." if no tasks are completed yet but we are analyzing
        if (completedCount === 0 || avgTimePerTask === 0) {
            return "计算中...";
        }
        
        // Calculate total expected duration based on fixed average time
        const totalExpectedDuration = avgTimePerTask * tasks.length;
        const elapsedTotal = (now - analysisStartTime) / 1000;
        
        // Remaining time = Total Expected - Elapsed
        const remainingSeconds = Math.max(0, Math.round(totalExpectedDuration - elapsedTotal));
        
        if (remainingSeconds < 60) return `${remainingSeconds}秒`;
        return `${Math.ceil(remainingSeconds / 60)}分钟`;
    }, [completedCount, analysisStartTime, tasks.length, now, avgTimePerTask]);


    const classAverages = useMemo(() => {
        if (!scoreData || scoreData.length === 0) return undefined;
        
        if (mode === 'class') {
            const avgs: Record<string, number> = {};
            scoreData.forEach((row, idx) => {
                // For class mode, we use normalized ID Q1, Q2...
                const qId = `Q${idx + 1}`;
                
                // row.score_rate might be "0.85" or "85%" or 85
                let rate = parseFloat(String(row.score_rate || row['得分率']).replace('%', ''));
                if (isNaN(rate)) rate = 0;
                
                // Heuristic: if rate is <= 1.05, assume 0-1 scale. If > 1.05, assume 0-100 or raw score?
                // But wait, the sample data says "0.85", "0.76".
                // If the user inputs 85 for 85%, we need to handle it.
                // Standard convention in this app seems to be 0-1 or 0-100.
                if (rate <= 1.05 && rate >= 0) {
                     // 0-1 scale, do nothing or multiply by 100 for display? 
                     // Wait, for 'earned' calculation: rate * full_score.
                     // So rate should be 0-1.
                } else if (rate > 1.05) {
                    // Assume 0-100 scale
                    rate = rate / 100;
                }
                
                const full = parseFloat(row.full_score || row['满分']) || (fullScores ? fullScores[qId] : 10) || 10;
                avgs[qId] = rate * full;
            });
            return avgs;
        }

        if (mode !== 'student') return undefined;
        const keys = Object.keys(scoreData[0]);
        const qKeys = keys.filter(k => k !== 'student_id' && k !== '姓名' && k !== '学号' && k !== 'name');
        
        const sums: Record<string, number> = {};
        const counts: Record<string, number> = {};
        
        qKeys.forEach(q => {
            sums[q] = 0;
            counts[q] = 0;
        });

        scoreData.forEach(row => {
            qKeys.forEach(q => {
                const val = parseFloat(row[q]);
                if (!isNaN(val)) {
                    sums[q] += val;
                    counts[q]++;
                }
            });
        });

        const avgs: Record<string, number> = {};
        qKeys.forEach(q => {
            avgs[q] = counts[q] > 0 ? parseFloat((sums[q] / counts[q]).toFixed(2)) : 0;
        });
        
        return avgs;
    }, [scoreData, mode, fullScores]);

    // --- Helper Functions ---
    const generateWeaknessMarkdown = (items: any[], mode: 'class' | 'student', questions?: any[]) => {
        let md = `# ${mode === 'class' ? '薄弱点智能诊断与训练建议' : '错题深度诊断与个性化提升'}\n\n`;
        
        items.forEach((item, index) => {
            let title = item["题号"] ? `题目 ${item["题号"]}` : `项目 ${index + 1}`;
            
            // Resolve Original ID for Markdown
            if (item["题号"] && questions) {
                 const qIdStr = String(item["题号"]).trim();
                 const qMatch = qIdStr.match(/Q(\d+)/i);
                 if (qMatch && qMatch[1]) {
                     const index = parseInt(qMatch[1]) - 1;
                     if (index >= 0 && index < questions.length) {
                         const originalId = questions[index].meta?.original_id || questions[index].id;
                         title = `题目 ${item["题号"]} (原题号: ${originalId})`;
                     }
                 }
            }

            md += `## ${title}\n\n`;
            
            if (mode === 'class') {
                md += `- **难度等级**: ${item["难度等级"] || 'N/A'}\n`;
                md += `- **得分率**: ${item["得分率"] || 'N/A'}\n`;
                if (item["核心能力要素"] && Array.isArray(item["核心能力要素"])) {
                    md += `- **核心能力要素**: ${item["核心能力要素"].join(', ')}\n`;
                }
                md += `\n### 问题诊断\n${item["问题诊断"] || '暂无'}\n\n`;
                md += `### 教学建议\n${item["教学建议"] || '暂无'}\n\n`;
                md += `### 推荐训练题型\n${item["推荐训练题型"] || '暂无'}\n\n`;
                md += `### 变式训练思路\n${item["变式训练思路"] || '暂无'}\n\n`;
            } else {
                md += `- **错误类型**: ${item["错误类型"] || 'N/A'}\n`;
                md += `\n### 根本原因\n${item["根本原因"] || '暂无'}\n\n`;
                md += `### 纠正建议\n${item["纠正建议"] || '暂无'}\n\n`;
                md += `### 推荐复习题型\n${item["推荐复习题型"] || '暂无'}\n\n`;
                md += `### 变式训练建议\n${item["变式训练建议"] || '暂无'}\n\n`;
            }
            md += `---\n\n`;
        });
        
        return md;
    };

    const handleDownloadWeaknessMD = (task: TaskInfo) => {
        if (!task.result) return;
        
        const items = mode === 'class' ? (task.result["能力短板诊断"] || []) : (task.result["错题分析"] || []);
        if (items.length === 0) {
            alert("暂无诊断数据可下载");
            return;
        }

        const content = generateWeaknessMarkdown(items, mode, questions);
        
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `深度诊断_${task.modelLabel}_${mode === 'class' ? '集体' : (task.id || '个人')}.md`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleDownloadReport = (task: TaskInfo) => {
        if (!task.result) return;
        
        let content = "";
        let extension = "md";
        
        if (task.result.markdown_report) {
            content = task.result.markdown_report;
        } else {
            content = JSON.stringify(task.result, null, 2);
            extension = "json";
        }
        
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${task.modelLabel}_${mode === 'class' ? '集体分析' : (task.id || '个人分析')}_报告.${extension}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleDownloadPDF = async (elementId: string, title: string) => {
        const element = document.getElementById(elementId);
        if (!element) return;

        try {
            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4',
            });

            const imgWidth = 210;
            const pageHeight = 297;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            
            let heightLeft = imgHeight;
            let position = 0;

            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;

            while (heightLeft >= 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }

            pdf.save(`${title}.pdf`);
        } catch (error) {
            console.error("PDF generation failed", error);
            alert("PDF生成失败，请重试");
        }
    };

    const handleDownloadRemedialMD = () => {
        if (remedialResults.length === 0) return;

        let content = `# 专属补救练习卷\n\n`;
        content += `生成时间：${new Date().toLocaleDateString()}\n\n`;
        content += `> 本试卷由 AI 根据您的薄弱知识点智能生成，旨在帮助您查漏补缺。\n\n`;
        
        content += `## 第一部分：题目卷\n\n`;
        remedialResults.forEach((item, index) => {
            content += `### 第 ${index + 1} 题 (${item.topic})\n\n`;
            content += `${item.variant.question}\n\n`;
            if (Array.isArray(item.variant.options) && item.variant.options.length > 0) {
                item.variant.options.forEach((opt: string) => {
                    content += `- ${opt}\n`;
                });
            }
            content += `\n---\n\n`;
        });

        content += `\n---\n\n`;
        content += `## 第二部分：答案与解析\n\n`;
        remedialResults.forEach((item, index) => {
             content += `### 第 ${index + 1} 题\n\n`;
             content += `**正确答案**: ${item.variant.answer}\n\n`;
             content += `**解析思路**:\n${item.variant.explanation}\n\n`;
             content += `---\n\n`;
        });

        const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `专属补救练习卷_${new Date().toLocaleDateString()}.md`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleGenerateRemedialPaper = async () => {
        const activeTask = tasks.find(t => t.configId === activeModelTab) || tasks[0];
        if (!activeTask || !activeTask.result) {
            alert("请先进行分析");
            return;
        }

        const items = mode === 'class' 
            ? (activeTask.result["能力短板诊断"] || []) 
            : (activeTask.result["错题分析"] || []);

        if (items.length === 0) {
            alert("未发现明显薄弱点，无需生成补救试卷。");
            return;
        }

        setRemedialOpen(true);
        setRemedialGenerating(true);
        setRemedialProgress(0);
        setRemedialResults([]);
        setRemedialTab(0);

        const config = modelConfigs.find(c => c.id === activeModelTab) || modelConfigs[0];
        const newResults: any[] = [];
        
        // Strategy: If items < 3, generate 2 per item. Else 1 per item.
        const countPerItem = items.length < 3 ? 2 : 1;
        const totalOps = items.length * countPerItem;
        let completedOps = 0;

        for (const item of items) {
            // Find question context
            const qIdRaw = item["题号"];
            let question: any = null;
            if (qIdRaw) {
                 const qIdStr = String(qIdRaw).trim();
                 // Try parsing Q-number directly
                 const qMatch = qIdStr.match(/Q(\d+)/i);
                 if (qMatch && qMatch[1]) {
                     const index = parseInt(qMatch[1]) - 1;
                     if (index >= 0 && index < questions.length) {
                         question = questions[index];
                     }
                 }
                 
                 // Fallback search
                 if (!question) {
                      question = questions.find(q => q.id === qIdRaw || q.id === `Q${qIdRaw}`);
                 }
            }

            if (!question) {
                console.warn("Remedial: Question not found for item", item);
                completedOps += countPerItem;
                setRemedialProgress(Math.min((completedOps / totalOps) * 100, 99));
                continue;
            }

            // Extract topic/ability (reuse logic)
            let topic = metaOverrides[question.id]?.framework_topic || '';
            let abilities = metaOverrides[question.id]?.ability_elements || '';
            if (!topic && question.analysis?.[config.label]) {
                 // eslint-disable-next-line @typescript-eslint/no-explicit-any
                 const analysis = question.analysis[config.label] as any;
                 topic = analysis.meta?.framework_topic || analysis.meta?.knowledge_topic || '';
                 const abs = analysis.meta?.ability_elements;
                 abilities = Array.isArray(abs) ? abs.join(',') : (abs || '');
            }
            if (!topic) topic = item["知识主题"] || "高中化学通用知识点";
            if (!abilities) abilities = item["核心能力要素"] ? (Array.isArray(item["核心能力要素"]) ? item["核心能力要素"].join(',') : item["核心能力要素"]) : "综合分析能力";

            // Loop for countPerItem
            for (let i = 0; i < countPerItem; i++) {
                try {
                    const response = await axios.post('http://127.0.0.1:8000/api/score/variant/generate', {
                        question_content: question.content,
                        topic: topic,
                        abilities: abilities,
                        config: {
                            provider: config.provider,
                            apiKey: config.apiKey,
                            baseUrl: config.baseUrl,
                            modelName: config.modelName
                        }
                    });
                    
                    if (response.data) {
                        newResults.push({
                            sourceId: question.id,
                            originalQuestion: question.content,
                            variant: response.data,
                            topic: topic
                        });
                    }
                } catch (e) {
                    console.error("Remedial gen error", e);
                } finally {
                    completedOps++;
                    setRemedialProgress(Math.min((completedOps / totalOps) * 100, 99));
                }
            }
        }

        setRemedialResults(newResults);
        setRemedialProgress(100);
        setRemedialGenerating(false);
    };

    const handleGenerateVariant = async (item: any) => {
        // 1. Identify Question ID
        const qIdRaw = item["题号"];
        if (!qIdRaw) {
            alert("无法识别题号，无法生成变式题。");
            return;
        }
        
        // Robust Question Matching Logic
        const qIdRawStr = String(qIdRaw).trim();
        const qIdDigits = qIdRawStr.replace(/[^\d]/g, '');
        const qIdNum = parseInt(qIdDigits);

        // --- NEW: Index-based lookup as primary method ---
        // Since we enforced "Q1" = questions[0], "Q2" = questions[1]...
        let question: any = null;
        
        // Try parsing Q-number directly
        const qMatch = qIdRawStr.match(/Q(\d+)/i);
        if (qMatch && qMatch[1]) {
            const index = parseInt(qMatch[1]) - 1;
            if (index >= 0 && index < questions.length) {
                question = questions[index];
            }
        }

        // Fallback to existing search logic if index lookup fails or if ID format isn't Q-based
        if (!question) {
            question = questions.find(q => {
                const tIdStr = String(q.id).trim();
                const tIdDigits = tIdStr.replace(/[^\d]/g, '');
                const tIdNum = parseInt(tIdDigits);

                // Normalize for flexible matching
                const qIdBase = qIdRawStr.replace(/^(Q|q|Question|题)\s*/, '').replace(/[\(（].*?[\)）]/, '').trim();
                const tIdBase = tIdStr.replace(/^(Q|q|Question|题)\s*/, '').replace(/[\(（].*?[\)）]/, '').trim();

                // 1. Exact String Match
                if (tIdStr === qIdRawStr) return true;
                
                // 2. Digits Match (e.g. "Q6" vs "6")
                if (qIdDigits && tIdDigits && qIdDigits === tIdDigits) return true;

                // 3. Numeric Match (e.g. "06" vs "6")
                if (!isNaN(qIdNum) && !isNaN(tIdNum) && qIdNum === tIdNum) return true;

                // 4. Prefix Match (Handle "Q3" matching "3_1", "3-1")
                // If upload is "Q3" and question file has "3_1", we match them.
                if (tIdBase.startsWith(qIdBase + '_') || tIdBase.startsWith(qIdBase + '-') || tIdBase.startsWith(qIdBase + '.')) return true;
                
                return false;
            });
        }
        
        if (!question) {
            console.warn(`Variant Generation: Question not found. Looking for: "${qIdRaw}" (Digits: ${qIdDigits}). Available IDs:`, questions.map(q => q.id));
            const availableIds = questions.slice(0, 10).map(q => q.id).join(', ');
            alert(`未找到题号为 "${qIdRaw}" 的原题内容。\n请确认上传的题目文件中包含此题号。\n当前已加载的题目ID有: ${availableIds}${questions.length > 10 ? '...' : ''}`);
            return;
        }

        // 2. Prepare Config (Use active tab's config)
        const config = modelConfigs.find(c => c.id === activeModelTab) || modelConfigs[0];
        if (!config) {
            alert("未找到模型配置。");
            return;
        }

        // 3. 获取主题和能力要素
        // 优先级: 元数据覆盖 (当前模型) > 分析结果 (当前模型) > 题目本身
        let topic = '';
        let abilities = '';

        // 尝试使用覆盖数据 (当前选中模型的)
        const override = metaOverrides[question.id]?.[config.label];
        if (override && override.framework_topic) topic = override.framework_topic;
        if (override && override.ability_elements) abilities = override.ability_elements;

        // Try Analysis Result
        if (!topic && question.analysis) {
            const analysis = question.analysis[config.label];
            if (analysis) {
                topic = analysis.meta?.framework_topic || analysis.meta?.knowledge_topic || '';
                const abs = analysis.meta?.ability_elements;
                abilities = Array.isArray(abs) ? abs.join(',') : (abs || '');
            }
        }
        
        // Fallback to item itself (from the weakness card data)
        if (!topic && item["知识主题"]) topic = item["知识主题"]; // Usually not in card item
        if (!abilities && item["核心能力要素"]) abilities = Array.isArray(item["核心能力要素"]) ? item["核心能力要素"].join(',') : item["核心能力要素"];

        if (!topic) topic = "高中化学通用知识点";
        if (!abilities) abilities = "综合分析能力";

        setVariantDialogOpen(true);
        setVariantLoading(true);
        setVariantResult(null);
        setVariantError(null);

        try {
            const response = await axios.post('http://127.0.0.1:8000/api/score/variant/generate', {
                question_content: question.content,
                topic: topic,
                abilities: abilities,
                config: {
                    provider: config.provider,
                    apiKey: config.apiKey,
                    baseUrl: config.baseUrl,
                    modelName: config.modelName
                }
            });
            
            setVariantResult(response.data);
        } catch (error: any) {
            console.error("Variant generation failed", error);
            setVariantError(error.response?.data?.detail || error.message || "生成失败，请重试。");
        } finally {
            setVariantLoading(false);
        }
    };

    // --- Render ---
    return (
        <Box sx={{ p: 2 }}>
            <Typography variant="h5" gutterBottom>
                学情数据分析
                <Tooltip title="查看帮助">
                    <IconButton onClick={() => setHelpOpen(true)} size="small" sx={{ ml: 1 }}>
                        <HelpOutlineIcon />
                    </IconButton>
                </Tooltip>
            </Typography>
            
            <Card variant="outlined" sx={{ mb: 4 }}>
                <CardContent>
                    <Typography variant="h6" gutterBottom>数据上传与配置</Typography>
                    
                    <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                        <Tabs value={mode} onChange={(_, newVal) => setMode(newVal)} aria-label="analysis mode tabs">
                            <Tab label="集体分析" value="class" />
                            <Tab label="个人分析" value="student" />
                        </Tabs>
                    </Box>

                    <FormatInstruction mode={mode} />

                    <Grid container spacing={2} alignItems="center" sx={{ mt: 2 }}>
                        <Grid item>
                            <input
                                key={mode}
                                type="file"
                                hidden
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                accept=".csv,.xlsx" 
                            />
                            <Button
                                variant="contained"
                                startIcon={<CloudUploadIcon />}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                选择文件
                            </Button>
                        </Grid>
                        <Grid item>
                            <Typography variant="body2" color="textSecondary">
                                {file ? file.name : "未选择文件"}
                            </Typography>
                        </Grid>
                        <Grid item>
                            <Button 
                                variant="outlined" 
                                onClick={handleUpload}
                                disabled={!file || uploading}
                            >
                                {uploading ? '上传中...' : '确认上传'}
                            </Button>
                        </Grid>
                    </Grid>

                    {previewData.length > 0 && (
                        <Box sx={{ mt: 3 }}>
                            <Typography variant="subtitle1" gutterBottom>数据预览 (可编辑)</Typography>
                            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400, overflow: 'auto' }}>
                                <Table size="small" stickyHeader>
                                    <TableHead>
                                        <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                            {Object.keys(previewData[0]).map(key => (
                                                <TableCell key={key} sx={{ fontWeight: 'bold' }}>{key}</TableCell>
                                            ))}
                                        </TableRow>
                                        {/* Full Score Editing Row */}
                                        {mode === 'student' && previewData[0] && (
                                            <TableRow sx={{ bgcolor: '#e3f2fd' }}>
                                                {Object.keys(previewData[0] as object).map(key => {
                                                     const isQuestion = typeof key === 'string' && key.startsWith('Q') && !isNaN(parseInt(key.slice(1)));
                                                     // Show existing full score or try to infer from header
                                                     const inferred = (typeof key === 'string' ? key.match(/[\(（](\d+)分?[\)）]/)?.[1] : undefined);
                                                     const displayValue = fullScores[key] !== undefined ? fullScores[key] : (inferred || '');
                                                     
                                                     return (
                                                         <TableCell key={key} sx={{ fontWeight: 'bold', color: 'primary.main', p: 1 }}>
                                                             {isQuestion ? (
                                                                 <TextField
                                                                      variant="standard"
                                                                      size="small"
                                                                      value={displayValue}
                                                                      placeholder={inferred || "10"}
                                                                      onChange={(e) => {
                                                                          let val = parseFloat(e.target.value);
                                                                          if (isNaN(val) || val < 0) val = 0;
                                                                          setFullScores(prev => ({
                                                                              ...prev,
                                                                              [key]: val
                                                                          }));
                                                                      }}
                                                                      InputProps={{ 
                                                                          disableUnderline: true, 
                                                                          style: { fontSize: '0.875rem', fontWeight: 'bold', color: '#1976d2' },
                                                                          endAdornment: <span style={{ fontSize: '0.7rem', color: '#999' }}>分</span>
                                                                      }}
                                                                      sx={{ width: 60 }}
                                                                  />
                                                             ) : (
                                                                 key === 'student_id' || key === '姓名' ? 
                                                                 <Typography variant="caption" color="primary" fontWeight="bold">题目满分:</Typography> 
                                                                 : ''
                                                             )}
                                                         </TableCell>
                                                     );
                                                })}
                                            </TableRow>
                                        )}
                                    </TableHead>
                                    <TableBody>
                                        {previewData.map((row, idx) => (
                                            <TableRow key={idx}>
                                                {Object.entries(row).map(([key, val], vIdx) => (
                                                    <TableCell key={vIdx}>
                                                        {/* Allow editing if it's a number-like field and not ID/Name */}
                                                        {(key !== 'student_id' && key !== 'question_id' && key !== '姓名' && key !== '学号' && key !== '题号') ? (
                                                            <TextField
                                                                variant="standard"
                                                                size="small"
                                                                value={val as string}
                                                                onChange={(e) => {
                                                                    const newData = [...previewData];
                                                                    newData[idx] = { ...newData[idx], [key]: e.target.value };
                                                                    setPreviewData(newData);
                                                                    setScoreData(newData); // Sync scoreData
                                                                }}
                                                                InputProps={{ disableUnderline: true, style: { fontSize: '0.875rem' } }}
                                                                sx={{ width: '100%' }}
                                                            />
                                                        ) : (
                                                            val as React.ReactNode
                                                        )}
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                            <Alert severity="success" sx={{ mt: 2 }}>
                                数据校验通过！共加载 {scoreData.length} 条数据。
                            </Alert>
                        </Box>
                    )}
                </CardContent>
            </Card>

            {/* Question Metadata Editor */}
            {questions.length > 0 && (
                <Accordion 
                    expanded={metaAccordionExpanded} 
                    onChange={(_, expanded) => setMetaAccordionExpanded(expanded)}
                    sx={{ mb: 4, border: '1px solid #e0e0e0', borderRadius: '8px !important', '&:before': { display: 'none' }, boxShadow: 'none' }}
                >
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <AssignmentIcon color="primary" />
                            <Typography variant="subtitle1" fontWeight="bold">题目元数据校对 (可选)</Typography>
                            <Chip label="智能分析前必填/选填" size="small" color="warning" variant="outlined" sx={{ ml: 1 }} />
                        </Box>
                    </AccordionSummary>
                    <AccordionDetails>
                        <Alert severity="info" sx={{ mb: 2 }}>
                            在此处修正题目的<b>框架知识主题</b>和<b>能力要素</b>，系统将基于修正后的数据进行学情分析，避免模型幻觉导致分析偏差。
                        </Alert>
                        <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
                            <Table stickyHeader size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell width="6%">系统题号</TableCell>
                                        <TableCell width="8%">实际题号</TableCell>
                                        <TableCell width="20%">题目内容</TableCell>
                                        <TableCell width="12%">难度评级</TableCell>
                                        <TableCell width="24%">框架知识主题</TableCell>
                                        <TableCell width="30%">能力要素 (逗号分隔)</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {questions.map((q, idx) => (
                                        <TableRow key={q.id} sx={{ '& td': { verticalAlign: 'top' } }}>
                                            <TableCell sx={{ fontWeight: 'bold', color: '#1976d2' }}>{`Q${idx + 1}`}</TableCell>
                                            <TableCell sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>{q.id}</TableCell>
                                            <TableCell>
                                                <Tooltip title={q.content}>
                                                    <Typography noWrap variant="body2" sx={{ maxWidth: 200 }}>
                                                        {q.content.substring(0, 30)}...
                                                    </Typography>
                                                </Tooltip>
                                            </TableCell>
                                            
                                            {/* 难度评级 */}
                                            <TableCell>
                                                <Stack spacing={2}>
                                                    {modelConfigs.map(config => (
                                                        <Box key={config.id}>
                                                            <Typography variant="caption" color="primary" sx={{ fontWeight: 'bold', display: 'block', mb: 0.5 }}>
                                                                {getModelDisplayLabel(config)}
                                                            </Typography>
                                                            <Select
                                                                fullWidth
                                                                size="small"
                                                                value={metaOverrides[q.id]?.[config.label]?.difficulty || ''}
                                                                onChange={(e) => handleMetaChange(q.id, config.label, 'difficulty', e.target.value)}
                                                                displayEmpty
                                                                sx={{ height: 32, fontSize: '0.875rem' }}
                                                            >
                                                                <MenuItem value="" disabled>选择</MenuItem>
                                                                {['L1', 'L2', 'L3', 'L4', 'L5'].map(l => (
                                                                    <MenuItem key={l} value={l}>{l}</MenuItem>
                                                                ))}
                                                            </Select>
                                                        </Box>
                                                    ))}
                                                </Stack>
                                            </TableCell>

                                            {/* 框架知识主题 */}
                                            <TableCell>
                                                <Stack spacing={2}>
                                                    {modelConfigs.map(config => (
                                                        <Box key={config.id}>
                                                            <Typography variant="caption" color="primary" sx={{ fontWeight: 'bold', display: 'block', mb: 0.5 }}>
                                                                {getModelDisplayLabel(config)}
                                                            </Typography>
                                                            <Select
                                                                fullWidth
                                                                size="small"
                                                                value={metaOverrides[q.id]?.[config.label]?.framework_topic || ''}
                                                                onChange={(e) => handleMetaChange(q.id, config.label, 'framework_topic', e.target.value)}
                                                                displayEmpty
                                                                sx={{ height: 32, fontSize: '0.875rem' }}
                                                            >
                                                                <MenuItem value="" disabled>选择主题</MenuItem>
                                                                {FRAMEWORK_TOPICS.map(topic => (
                                                                    <MenuItem key={topic} value={topic}>{topic}</MenuItem>
                                                                ))}
                                                            </Select>
                                                        </Box>
                                                    ))}
                                                </Stack>
                                            </TableCell>

                                            {/* 能力要素 */}
                                            <TableCell>
                                                <Stack spacing={2}>
                                                    {modelConfigs.map(config => (
                                                        <Box key={config.id}>
                                                            <Typography variant="caption" color="primary" sx={{ fontWeight: 'bold', display: 'block', mb: 0.5 }}>
                                                                {getModelDisplayLabel(config)}
                                                            </Typography>
                                                            <TextField 
                                                                fullWidth 
                                                                size="small" 
                                                                placeholder="如: A1, B2" 
                                                                value={metaOverrides[q.id]?.[config.label]?.ability_elements || ''}
                                                                onChange={(e) => handleMetaChange(q.id, config.label, 'ability_elements', e.target.value)}
                                                                sx={{ '& .MuiInputBase-root': { height: 32, fontSize: '0.875rem' } }}
                                                            />
                                                        </Box>
                                                    ))}
                                                </Stack>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </AccordionDetails>
                </Accordion>
            )}

            <Box sx={{ mb: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                
                {/* Model Selection UI - Replaced with Info Card */}
                <Card variant="outlined" sx={{ p: 2, bgcolor: '#f8f9fa', width: 'fit-content', minWidth: 400 }}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1, textAlign: 'center' }}>
                        将使用以下模型进行并发分析:
                    </Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="center" alignItems="center">
                        {modelConfigs.map((config, index) => (
                            <Tooltip 
                                key={config.id} 
                                title={getModelDisplayLabel(config)} 
                                placement="top"
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
                        ))}
                    </Stack>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, textAlign: 'center' }}>
                        提示：系统将分别基于每个模型的难度评级结果进行独立的学情诊断。
                    </Typography>
                </Card>

                <Stack direction="row" spacing={2}>
                    <Button 
                        variant="contained" 
                        color="primary" 
                        size="large"
                        startIcon={analyzing ? <LinearProgress sx={{ width: 100 }} /> : <PlayArrowIcon />}
                        onClick={handleStartAnalysis}
                        disabled={analyzing || scoreData.length === 0}
                    >
                        {analyzing ? '智能分析中...' : '开始智能分析'}
                    </Button>

                    {analyzing && (
                        <Button
                            variant="outlined"
                            color="error"
                            size="large"
                            startIcon={<StopIcon />}
                            onClick={handleStopAnalysis}
                        >
                            终止分析
                        </Button>
                    )}
                </Stack>
            </Box>

            {/* Analysis Results Display */}
            {analyzing && (
                <Box sx={{ mb: 4 }}>
                     <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', mb: 1 }}>
                        <Typography variant="subtitle1">分析进度: {progress.toFixed(0)}%</Typography>
                        {estimatedTimeRemaining && (
                            <Typography variant="body2" color="primary">
                                预计剩余时间: 约 {estimatedTimeRemaining}
                            </Typography>
                        )}
                     </Box>
                     <LinearProgress variant="determinate" value={progress} />
                     <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                         已完成: {completedCount} / {tasks.length}
                     </Typography>
                </Box>
            )}

            {tasks.length > 0 && (
                <Grid container spacing={2}>
                    <Grid item xs={12} md={3}>
                        <Card variant="outlined" sx={{ height: '100%' }}>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>分析对象列表</Typography>
                                <Stack spacing={1} sx={{ maxHeight: 600, overflow: 'auto' }}>
                                    {/* Overview Item */}
                                    <Box 
                                        sx={{ 
                                            p: 1, 
                                            border: '1px solid #eee', 
                                            borderRadius: 1,
                                            cursor: 'pointer',
                                            bgcolor: selectedResultId === 'overview' ? '#e3f2fd' : 'transparent',
                                            '&:hover': { bgcolor: '#f5f5f5' },
                                            mb: 1,
                                            borderLeft: selectedResultId === 'overview' ? '4px solid #1976d2' : '1px solid #eee'
                                        }}
                                        onClick={() => setSelectedResultId('overview')}
                                    >
                                        <Typography variant="body2" fontWeight="bold" color="primary">
                                            📊 {mode === 'class' ? '全班总览' : '全员概览'}
                                        </Typography>
                                    </Box>

                                    {Array.from(new Set(tasks.map(t => t.id))).map(subjectId => {
                                        const subjectTasks = tasks.filter(t => t.id === subjectId);
                                        const isSelected = selectedResultId === subjectId;
                                        const allSuccess = subjectTasks.every(t => t.status === 'success');
                                        const anyProcessing = subjectTasks.some(t => t.status === 'processing' || t.status === 'pending');
                                        const anyFailure = subjectTasks.some(t => t.status === 'failure');

                                        return (
                                        <Box 
                                            key={subjectId} 
                                            sx={{ 
                                                p: 1, 
                                                border: '1px solid #eee', 
                                                borderRadius: 1,
                                                cursor: 'pointer',
                                                bgcolor: isSelected ? '#e3f2fd' : 'transparent',
                                                '&:hover': { bgcolor: '#f5f5f5' }
                                            }}
                                            onClick={() => setSelectedResultId(subjectId)}
                                        >
                                            <Grid container justifyContent="space-between" alignItems="center">
                                                <Grid item>
                                                    <Typography variant="body2" fontWeight="bold">
                                                        {subjectId === 'class_analysis' ? '全班总体分析' : `学生: ${subjectId}`}
                                                    </Typography>
                                                </Grid>
                                                <Grid item>
                                                    {allSuccess && <CheckCircleIcon color="success" fontSize="small" />}
                                                    {anyFailure && !anyProcessing && <Typography variant="caption" color="error">部分失败</Typography>}
                                                    {anyProcessing && <Typography variant="caption" color="warning">处理中</Typography>}
                                                </Grid>
                                            </Grid>
                                        </Box>
                                        );
                                    })}
                                </Stack>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={12} md={9}>
                        {selectedResultId === 'overview' ? (
                             <Box sx={{ mt: 0, width: '100%' }}>
                                 <Typography variant="h6" gutterBottom color="primary">
                                     {mode === 'class' ? '全班数据总览' : '全员得分分布'}
                                 </Typography>
                                 <ScoreDataOverview data={scoreData} mode={mode} />
                             </Box>
                        ) : selectedResultId ? (
                            (() => {
                                const subjectTasks = tasks.filter(t => t.id === selectedResultId);
                                if (subjectTasks.length === 0) return <Typography>暂无结果</Typography>;
                                
                                const activeTask = subjectTasks.find(t => t.configId === activeModelTab) || subjectTasks[0];
                                
                                const studentRow = mode === 'student' ? scoreData.find(s => 
                                    (s.student_id === selectedResultId) || 
                                    (s['姓名'] === selectedResultId) ||
                                    (s['学号'] === selectedResultId)
                                ) : undefined;

                                return (
                                    <Box>
                                        {/* Model Tabs */}
                                        <Paper sx={{ mb: 2 }}>
                                            <Tabs 
                                                value={activeTask.configId} 
                                                onChange={(_, val) => setActiveModelTab(val)}
                                                indicatorColor="primary"
                                                textColor="primary"
                                                variant="scrollable"
                                                scrollButtons="auto"
                                                sx={{ borderBottom: 1, borderColor: 'divider' }}
                                            >
                                                {subjectTasks.map(t => (
                                                    <Tab 
                                                        key={t.configId} 
                                                        value={t.configId} 
                                                        label={
                                                            <Stack direction="row" spacing={1} alignItems="center">
                                                                <span>{t.modelLabel}</span>
                                                                {t.status === 'success' && <CheckCircleIcon color="success" sx={{ fontSize: 16 }} />}
                                                                {t.status === 'processing' && <CircularProgress size={12} />}
                                                                {t.status === 'failure' && <Typography color="error" variant="caption">!</Typography>}
                                                            </Stack>
                                                        } 
                                                    />
                                                ))}
                                            </Tabs>
                                        </Paper>

                                        {activeTask.status === 'success' && activeTask.result ? (
                                            <Box>
                                                {/* Charts */}
                                                <AnalysisCharts 
                                                    result={activeTask.result} 
                                                    mode={mode} 
                                                    studentRow={studentRow}
                                                    classAverages={classAverages}
                                                    fullScores={fullScores}
                                                    questions={questions}
                                                />

                                                <WeaknessCards 
                                                    result={activeTask.result} 
                                                    mode={mode} 
                                                    onDownloadMD={() => handleDownloadWeaknessMD(activeTask)}
                                                    onDownloadPDF={() => handleDownloadPDF('weakness-cards-container', `深度诊断_${activeTask.modelLabel}_${mode === 'class' ? '集体' : (activeTask.id || '个人')}`)}
                                                    onGenerateVariant={handleGenerateVariant}
                                                    onGenerateRemedial={handleGenerateRemedialPaper}
                                                    questions={questions}
                                                />

                                                <Divider sx={{ my: 3 }} />

                                                    <Card variant="outlined" sx={{ border: 'none', boxShadow: 'none' }} id="smart-analysis-report-container">
                                                        <CardContent sx={{ p: 0 }}>
                                                            <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2, bgcolor: '#f8f9fa', borderRadius: 2, borderLeft: '5px solid #1976d2' }}>
                                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                    <AssignmentIcon color="primary" />
                                                                    <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                                                                        智能分析报告 ({activeTask.modelLabel})
                                                                    </Typography>
                                                                </Box>
                                                                <Stack direction="row" spacing={1}>
                                                                    <Button 
                                                                        variant="outlined" 
                                                                        startIcon={<DownloadIcon />} 
                                                                        size="small"
                                                                        onClick={() => handleDownloadReport(activeTask)}
                                                                    >
                                                                        .md
                                                                    </Button>
                                                                    <Button 
                                                                        variant="outlined" 
                                                                        startIcon={<DownloadIcon />} 
                                                                        size="small"
                                                                        onClick={() => handleDownloadPDF('smart-analysis-report-container', `分析报告_${activeTask.modelLabel}_${mode === 'class' ? '集体' : (activeTask.id || '个人')}`)}
                                                                    >
                                                                        .pdf
                                                                    </Button>
                                                                </Stack>
                                                            </Box>
                                                            
                                                            <Box sx={{ p: 1 }}>
                                                                {activeTask.result.markdown_report ? (
                                                                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                                                        {activeTask.result.markdown_report}
                                                                    </ReactMarkdown>
                                                                ) : (
                                                                <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem', fontFamily: 'inherit' }}>
                                                                    {JSON.stringify(activeTask.result, null, 2)}
                                                                </pre>
                                                            )}
                                                        </Box>
                                                    </CardContent>
                                                </Card>
                                            </Box>
                                        ) : (
                                            <Box sx={{ p: 4, textAlign: 'center', bgcolor: '#f5f5f5', borderRadius: 2 }}>
                                                {activeTask.status === 'processing' && <Typography>正在使用 {activeTask.modelLabel} 进行智能分析，请稍候...</Typography>}
                                                {activeTask.status === 'pending' && <Typography>等待分析...</Typography>}
                                                {activeTask.status === 'failure' && (
                                                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                                        <Typography color="error">分析失败: {activeTask.error}</Typography>
                                                        <Button 
                                                            variant="contained" 
                                                            color="primary" 
                                                            startIcon={<RefreshIcon />}
                                                            onClick={() => handleRetryTask(activeTask)}
                                                        >
                                                            重新分析
                                                        </Button>
                                                    </Box>
                                                )}
                                            </Box>
                                        )}
                                    </Box>
                                );
                            })()
                        ) : (
                            <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Typography color="textSecondary">请从左侧列表选择查看分析详情</Typography>
                                {mode === 'class' && scoreData.length > 0 && (
                                    <Box sx={{ mt: 4, width: '100%' }}>
                                         <ScoreDataOverview data={scoreData} mode={mode} />
                                    </Box>
                                )}
                                {mode === 'student' && scoreData.length > 0 && !selectedResultId && (
                                    <Box sx={{ mt: 4, width: '100%' }}>
                                         <ScoreDataOverview data={scoreData} mode={mode} />
                                    </Box>
                                )}
                            </Box>
                        )}
                    </Grid>
                </Grid>
            )}

            {/* Help Dialog */}
            <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>学情分析系统帮助文档</DialogTitle>
                <DialogContent dividers>
                    <Typography variant="h6" gutterBottom>常见问题</Typography>
                    
                    <Typography variant="subtitle1" fontWeight="bold">1. 集体分析与个人分析的区别？</Typography>
                    <Typography paragraph>
                        <b>集体分析</b>侧重于班级整体的教学质量评估，识别共性薄弱知识点，辅助老师调整教学进度。<br/>
                        <b>个人分析</b>侧重于每位学生的个性化诊断，生成“一人一策”的提分建议。
                    </Typography>

                    <Typography variant="subtitle1" fontWeight="bold">2. 数据上传失败怎么办？</Typography>
                    <Typography paragraph>
                        请检查：<br/>
                        - 文件格式是否为 Excel (.xlsx) 或 CSV。<br/>
                        - 文件大小是否超过 10MB。<br/>
                        - 列名是否符合规范（如“题号”、“得分率”等）。<br/>
                        - 数据中是否包含特殊字符或空行。
                    </Typography>

                    <Typography variant="subtitle1" fontWeight="bold">3. 如何获取分析结果？</Typography>
                    <Typography paragraph>
                        上传数据并点击“开始智能分析”后，系统将自动调用大模型进行处理。处理完成后，左侧列表会显示所有分析对象（班级或学生），点击即可查看详细报告和图表。
                    </Typography>
                </DialogContent>
            </Dialog>

            {/* Variant Generation Dialog */}
            <Dialog open={variantDialogOpen} onClose={() => setVariantDialogOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AutoFixHighIcon color="secondary" />
                    AI 智能生成变式训练题
                </DialogTitle>
                <DialogContent dividers>
                    {variantLoading ? (
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 8 }}>
                            <CircularProgress size={60} color="secondary" sx={{ mb: 3 }} />
                            <Typography variant="h6" color="text.secondary">正在根据原题知识点和能力要素生成同质变式题...</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>AI 正在构思新的题干和选项，请稍候</Typography>
                        </Box>
                    ) : variantError ? (
                        <Alert severity="error" sx={{ mt: 2 }}>
                            <AlertTitle>生成失败</AlertTitle>
                            {variantError}
                        </Alert>
                    ) : variantResult ? (
                        <Box sx={{ p: 1 }}>
                            <Alert severity="success" icon={<CheckCircleIcon />} sx={{ mb: 3 }}>
                                <AlertTitle>生成成功</AlertTitle>
                                已为您生成一道与原题同质不同形的变式训练题。
                            </Alert>
                            
                            <Paper variant="outlined" sx={{ p: 3, mb: 3, bgcolor: '#fbfbfb' }}>
                                <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
                                    【变式题】
                                </Typography>
                                <Typography variant="body1" paragraph sx={{ whiteSpace: 'pre-wrap' }}>
                                    {variantResult.question}
                                </Typography>
                                
                                <Stack spacing={1} sx={{ mt: 2 }}>
                                    {Array.isArray(variantResult.options) && variantResult.options.map((opt: string, idx: number) => (
                                        <Typography key={idx} variant="body1" sx={{ p: 1, '&:hover': { bgcolor: '#eee', borderRadius: 1 } }}>
                                            {opt}
                                        </Typography>
                                    ))}
                                </Stack>
                            </Paper>

                            <Accordion defaultExpanded>
                                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>
                                        查看答案与解析
                                    </Typography>
                                </AccordionSummary>
                                <AccordionDetails>
                                    <Box sx={{ mb: 2 }}>
                                        <Typography variant="subtitle2" color="success.main" gutterBottom>【正确答案】</Typography>
                                        <Typography variant="body1" fontWeight="bold">{variantResult.answer}</Typography>
                                    </Box>
                                    <Box>
                                        <Typography variant="subtitle2" color="info.main" gutterBottom>【解析】</Typography>
                                        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
                                            {variantResult.explanation}
                                        </Typography>
                                    </Box>
                                </AccordionDetails>
                            </Accordion>
                        </Box>
                    ) : null}
                </DialogContent>
                <CardActions sx={{ justifyContent: 'flex-end', p: 2 }}>
                    <Button onClick={() => setVariantDialogOpen(false)}>关闭</Button>
                    {variantResult && (
                        <Button variant="contained" color="primary" onClick={() => {
                            const text = `【题目】\n${variantResult.question}\n\n【选项】\n${variantResult.options.join('\n')}\n\n【答案】\n${variantResult.answer}\n\n【解析】\n${variantResult.explanation}`;
                            navigator.clipboard.writeText(text);
                            alert("题目已复制到剪贴板");
                        }}>
                            复制题目
                        </Button>
                    )}
                </CardActions>
            </Dialog>

            {/* Remedial Paper Dialog */}
            <Dialog 
                open={remedialOpen} 
                onClose={() => !remedialGenerating && setRemedialOpen(false)} 
                maxWidth="lg" 
                fullWidth
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AutoFixHighIcon color="secondary" />
                        专属补救练习卷生成
                    </Box>
                    {!remedialGenerating && remedialResults.length > 0 && (
                            <Stack direction="row" spacing={2}>
                                 <Button 
                                    variant="outlined" 
                                    startIcon={<DownloadIcon />} 
                                    onClick={() => handleDownloadPDF('remedial-question-paper-print', `专属补救练习卷_题目卷_${new Date().toLocaleDateString()}`)}
                                 >
                                    题目卷(PDF)
                                 </Button>
                                 <Button 
                                    variant="outlined" 
                                    startIcon={<DownloadIcon />} 
                                    onClick={() => handleDownloadPDF('remedial-answer-key-print', `专属补救练习卷_解析卷_${new Date().toLocaleDateString()}`)}
                                 >
                                    解析卷(PDF)
                                 </Button>
                                 <Button 
                                    variant="outlined" 
                                    color="inherit"
                                    startIcon={<DownloadIcon />} 
                                    onClick={handleDownloadRemedialMD}
                                 >
                                    完整试卷(.md)
                                 </Button>
                            </Stack>
                    )}
                </DialogTitle>
                <DialogContent dividers>
                    {remedialGenerating ? (
                        <Box sx={{ py: 8, textAlign: 'center' }}>
                            <Typography variant="h6" gutterBottom>正在为您定制专属补救方案...</Typography>
                            <Typography variant="body2" color="text.secondary" paragraph>
                                系统正在扫描您的薄弱知识点，并调用 AI 生成针对性的变式训练题。
                            </Typography>
                            <Box sx={{ width: '60%', mx: 'auto', mt: 4 }}>
                                <LinearProgress variant="determinate" value={remedialProgress} sx={{ height: 10, borderRadius: 5 }} />
                                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                                    已完成 {Math.round(remedialProgress)}%
                                </Typography>
                            </Box>
                        </Box>
                    ) : remedialResults.length > 0 ? (
                        <Box sx={{ height: '70vh', display: 'flex', flexDirection: 'column' }}>
                            <Tabs 
                                value={remedialTab} 
                                onChange={(_, val) => setRemedialTab(val)}
                                sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
                            >
                                <Tab label="题目卷 (预览)" />
                                <Tab label="解析卷 (预览)" />
                            </Tabs>
                            
                            <Box sx={{ flex: 1, overflowY: 'auto', bgcolor: '#f5f5f5', p: 3, borderRadius: 2 }}>
                                {remedialTab === 0 ? (
                                    <Paper sx={{ p: 5, minHeight: '100%', maxWidth: '800px', mx: 'auto' }}>
                                        <Typography variant="h4" align="center" gutterBottom sx={{ fontWeight: 'bold', mb: 4 }}>
                                            专属补救练习卷
                                        </Typography>
                                        <Typography variant="subtitle1" align="center" gutterBottom sx={{ mb: 6, color: 'text.secondary' }}>
                                            — 针对薄弱点定向突破 —
                                        </Typography>
                                        
                                        {remedialResults.map((item, index) => (
                                            <Box key={index} sx={{ mb: 4 }}>
                                                <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 2 }}>
                                                    {index + 1}. ({item.topic})
                                                </Typography>
                                                <Typography paragraph sx={{ whiteSpace: 'pre-wrap' }}>
                                                    {item.variant.question}
                                                </Typography>
                                                <Stack spacing={1} sx={{ ml: 2 }}>
                                                    {Array.isArray(item.variant.options) && item.variant.options.map((opt: string, i: number) => (
                                                        <Typography key={i}>{opt}</Typography>
                                                    ))}
                                                </Stack>
                                                <Divider sx={{ mt: 4, borderStyle: 'dashed' }} />
                                            </Box>
                                        ))}
                                    </Paper>
                                ) : (
                                    <Paper sx={{ p: 5, minHeight: '100%', maxWidth: '800px', mx: 'auto' }}>
                                        <Typography variant="h4" align="center" gutterBottom sx={{ fontWeight: 'bold', mb: 4 }}>
                                            专属补救练习卷 · 答案与解析
                                        </Typography>
                                        
                                        {remedialResults.map((item, index) => (
                                            <Box key={index} sx={{ mb: 5, p: 3, bgcolor: '#fafafa', borderRadius: 2 }}>
                                                <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1, color: 'text.secondary' }}>
                                                    第 {index + 1} 题 ({item.topic})
                                                </Typography>
                                                <Typography paragraph sx={{ fontSize: '0.9rem', color: 'text.secondary', mb: 2 }}>
                                                    {item.variant.question}
                                                </Typography>
                                                
                                                <Box sx={{ mb: 2 }}>
                                                    <Chip label="正确答案" color="success" size="small" sx={{ mb: 1 }} />
                                                    <Typography fontWeight="bold" sx={{ ml: 1 }}>{item.variant.answer}</Typography>
                                                </Box>
                                                
                                                <Box>
                                                    <Chip label="解析思路" color="info" size="small" sx={{ mb: 1 }} />
                                                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', ml: 1, lineHeight: 1.8 }}>
                                                        {item.variant.explanation}
                                                    </Typography>
                                                </Box>
                                            </Box>
                                        ))}
                                    </Paper>
                                )}
                            </Box>
                        </Box>
                    ) : (
                        <Box sx={{ py: 4, textAlign: 'center' }}>
                            <Typography color="text.secondary">暂无生成结果</Typography>
                        </Box>
                    )}
                </DialogContent>
                <CardActions>
                    <Button onClick={() => setRemedialOpen(false)} disabled={remedialGenerating}>关闭</Button>
                </CardActions>
            </Dialog>

            {/* Hidden Print Areas for PDF Generation */}
            <div style={{ position: 'absolute', left: '-10000px', top: 0 }}>
                {/* Question Paper Print Layout */}
                <div id="remedial-question-paper-print" style={{ width: '800px', padding: '60px', backgroundColor: 'white', color: 'black' }}>
                    <div style={{ textAlign: 'center', marginBottom: '40px', borderBottom: '2px solid #000', paddingBottom: '20px' }}>
                         <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '10px' }}>专属补救练习卷</h1>
                         <p style={{ fontSize: '14px', color: '#666' }}>生成时间：{new Date().toLocaleDateString()}</p>
                    </div>
                    {remedialResults.map((item, index) => (
                        <div key={index} style={{ marginBottom: '30px', pageBreakInside: 'avoid' }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: '10px' }}>
                                <span style={{ fontWeight: 'bold', marginRight: '10px', fontSize: '16px' }}>{index + 1}.</span>
                                <span style={{ backgroundColor: '#f0f0f0', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', marginRight: '10px' }}>{item.topic}</span>
                            </div>
                            <div style={{ marginBottom: '15px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                                {item.variant.question}
                            </div>
                            <div style={{ marginLeft: '20px' }}>
                                {Array.isArray(item.variant.options) && item.variant.options.map((opt: string, i: number) => (
                                    <div key={i} style={{ marginBottom: '5px' }}>{opt}</div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Answer Key Print Layout */}
                <div id="remedial-answer-key-print" style={{ width: '800px', padding: '60px', backgroundColor: 'white', color: 'black' }}>
                    <div style={{ textAlign: 'center', marginBottom: '40px', borderBottom: '2px solid #000', paddingBottom: '20px' }}>
                         <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '10px' }}>专属补救练习卷 · 答案与解析</h1>
                         <p style={{ fontSize: '14px', color: '#666' }}>生成时间：{new Date().toLocaleDateString()}</p>
                    </div>
                    {remedialResults.map((item, index) => (
                        <div key={index} style={{ marginBottom: '40px', pageBreakInside: 'avoid', borderBottom: '1px dashed #ccc', paddingBottom: '20px' }}>
                            <div style={{ marginBottom: '10px', fontWeight: 'bold' }}>第 {index + 1} 题</div>
                            <div style={{ marginBottom: '15px', fontSize: '14px', color: '#666' }}>{item.variant.question}</div>
                            
                            <div style={{ marginBottom: '15px' }}>
                                <span style={{ fontWeight: 'bold', color: '#2e7d32', marginRight: '10px' }}>【正确答案】</span>
                                <span>{item.variant.answer}</span>
                            </div>
                            
                            <div>
                                <div style={{ fontWeight: 'bold', color: '#0288d1', marginBottom: '5px' }}>【解析】</div>
                                <div style={{ lineHeight: '1.8', whiteSpace: 'pre-wrap' }}>
                                    {item.variant.explanation}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </Box>
    );
};
