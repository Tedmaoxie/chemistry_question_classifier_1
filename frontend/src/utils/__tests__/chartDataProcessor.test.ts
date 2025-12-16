import { describe, it, expect } from 'vitest';
import { processChartData } from '../chartDataProcessor';
import { Question } from '../../types';

describe('processChartData', () => {
    it('should correctly filter out core knowledge framework topics', () => {
        const mockQuestions: Question[] = [
            {
                id: '1',
                content: 'test',
                preview: 'test',
                status: 'completed',
                analysis: {
                    'model1': {
                        final_level: 'L1',
                        meta: {
                            framework_topic: '物质结构基础', // Should keep
                            knowledge_topic: '原子结构',
                            ability_elements: ['A1']
                        }
                    },
                    'model2': {
                        final_level: 'L2',
                        meta: {
                            framework_topic: '化学核心素养', // Should filter (contains "核心")
                            knowledge_topic: '宏观辨识',
                            ability_elements: ['B1']
                        }
                    },
                    'model3': {
                        final_level: 'L3',
                        meta: {
                            framework_topic: 'Core Concepts', // Should filter (contains "Core")
                            knowledge_topic: 'Concept A',
                            ability_elements: ['C1']
                        }
                    },
                    'model4': {
                        final_level: 'L1',
                        meta: {
                            framework_topic: '未知', // Should filter
                            knowledge_topic: 'Unknown',
                            ability_elements: []
                        }
                    }
                }
            }
        ];

        const { frameworkData } = processChartData(mockQuestions);

        // Verify Framework Data
        // Expect only '物质结构基础'
        const frameworkNames = frameworkData.map(d => d.name);
        expect(frameworkNames).toContain('物质结构基础');
        expect(frameworkNames).not.toContain('化学核心素养');
        expect(frameworkNames).not.toContain('Core Concepts');
        expect(frameworkNames).not.toContain('未知');

        // Verify structure of valid item (Simplified to flat structure)
        const validItem = frameworkData.find(d => d.name === '物质结构基础');
        expect(validItem).toBeDefined();
        // expect(validItem?.children).toHaveLength(1); // No children anymore
        expect(validItem?.value).toBe(1);
    });

    it('should correctly count difficulty levels', () => {
        const mockQuestions: Question[] = [
            {
                id: '1',
                content: 'test',
                preview: 'test',
                status: 'completed',
                analysis: {
                    'm1': { final_level: 'L1' },
                    'm2': { comprehensive_rating: { final_level: 'L3' } } // Alternative structure
                }
            },
            {
                id: '2',
                content: 'test2',
                preview: 'test2',
                status: 'completed',
                analysis: {
                    'm1': { final_level: 'L1 简单' } // String with extra text
                }
            }
        ];

        const { difficultyData } = processChartData(mockQuestions);

        const l1 = difficultyData.find(d => d.name === 'L1');
        const l3 = difficultyData.find(d => d.name === 'L3');
        
        expect(l1?.value).toBe(2); // m1 from q1 + m1 from q2
        expect(l3?.value).toBe(1); // m2 from q1
    });

    it('should correctly count ability elements', () => {
        const mockQuestions: Question[] = [
            {
                id: '1',
                content: 'test',
                preview: 'test',
                status: 'completed',
                analysis: {
                    'm1': { 
                        meta: { ability_elements: ['A1', 'B2'] }
                    }
                }
            }
        ];

        const { abilityData } = processChartData(mockQuestions);

        expect(abilityData.categories).toEqual(['A1', 'B2']);
        expect(abilityData.values).toEqual([1, 1]);
    });
});
