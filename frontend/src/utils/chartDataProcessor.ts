import { Question } from '../types';

export const processChartData = (questions: Question[]) => {
    const diffCounts: Record<string, number> = { 'L1': 0, 'L2': 0, 'L3': 0, 'L4': 0, 'L5': 0 };
    const abilityCounts: Record<string, number> = {};
    const frameworkHierarchy: Record<string, Record<string, number>> = {};

    questions.forEach(q => {
        if (q.status === 'completed' && q.analysis) {
            Object.values(q.analysis).forEach((result: any) => {
                if (typeof result !== 'object' || !result) return;

                // 1. Difficulty
                const level = result.final_level || result.comprehensive_rating?.final_level;
                if (level) {
                    // Normalize level string (e.g. "L1 简单" -> "L1")
                    const match = level.match(/(L[1-5])/);
                    const cleanLevel = match ? match[1] : level;
                    
                    if (diffCounts.hasOwnProperty(cleanLevel)) {
                        diffCounts[cleanLevel]++;
                    }
                }

                // 2. Ability
                const abilities = result.meta?.ability_elements;
                if (Array.isArray(abilities)) {
                    abilities.forEach((rawCode: string) => {
                        // Extract code like A1, B2 from string
                        const match = rawCode.match(/([A-C][1-3])/);
                        const code = match ? match[1] : rawCode.substring(0, 2); // Fallback
                        abilityCounts[code] = (abilityCounts[code] || 0) + 1;
                    });
                }

                // 3. Framework Knowledge (Strictly filter out Core Knowledge)
                // 仅统计框架知识，排除核心知识
                const framework = result.meta?.framework_topic;
                // const knowledge = result.meta?.knowledge_topic || '未知知识点'; // Removed as per requirement
                
                // 严格过滤：必须存在框架主题，且不能包含"核心"字样 (根据需求过滤核心知识能力)
                // 同时排除 "未知" 或 "未知框架"
                const isCore = framework && (framework.includes('核心') || framework.includes('Core'));
                const isValidFramework = framework && 
                                       typeof framework === 'string' && 
                                       framework !== '未知' && 
                                       framework !== '未知框架' &&
                                       !isCore;

                if (isValidFramework) {
                    if (!frameworkHierarchy[framework]) {
                        frameworkHierarchy[framework] = {};
                    }
                    // frameworkHierarchy[framework][knowledge] = (frameworkHierarchy[framework][knowledge] || 0) + 1;
                    // Simply count framework occurrences
                    // Using a dummy key or just a counter could work, but let's keep structure simple
                    // We can reuse the same structure but ignore children in output, OR change structure.
                    // Let's assume we just want to count frameworks.
                    // Re-using structure: frameworkHierarchy[framework]['count'] = ...
                    frameworkHierarchy[framework]['_count'] = (frameworkHierarchy[framework]['_count'] || 0) + 1;
                }
            });
        }
    });

    // Format Difficulty Data for ECharts
    // Explicitly map L1-L5 to ensure order matches color palette
    const difficultyChartData = ['L1', 'L2', 'L3', 'L4', 'L5'].map(level => ({
        name: level,
        value: diffCounts[level]
    }));

    // Format Ability Data for ECharts
    // Sort keys to keep A1, A2, B1... ordered
    const sortedAbilities = Object.keys(abilityCounts).sort();
    const abilityChartData = {
        categories: sortedAbilities,
        values: sortedAbilities.map(key => abilityCounts[key])
    };

    // Format Framework Data for ECharts (Simple Pie/Donut)
    // 仅展示框架主题，不展示考查内容
    const frameworkChartData = Object.entries(frameworkHierarchy).map(([fwName, children]) => ({
        name: fwName,
        value: children['_count'] || 0
    }));

    return {
        difficultyData: difficultyChartData,
        abilityData: abilityChartData,
        frameworkData: frameworkChartData
    };
};
