import React, { useState, useEffect } from 'react';
import { 
    Dialog, DialogTitle, DialogContent, DialogActions, Button, 
    List, ListItem, ListItemButton, ListItemText, ListItemSecondaryAction, 
    Typography, Tabs, Tab, Box, CircularProgress, IconButton, Chip 
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import StorageIcon from '@mui/icons-material/Storage';
import CloudIcon from '@mui/icons-material/Cloud';
import axios from 'axios';
import { RatingSession, RatingSessionSummary } from '../types';
import { getSessionList, getSessionDetail, deleteSession } from '../utils/indexedDb';

interface HistorySelectorProps {
    open: boolean;
    onClose: () => void;
    onLoad: (session: RatingSession) => void;
}
interface TabPanelProps {
    children?: React.ReactNode;
    index: number;
    value: number;
}

function TabPanel(props: TabPanelProps) {
    const { children, value, index, ...other } = props;
    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`history-tabpanel-${index}`}
            aria-labelledby={`history-tab-${index}`}
            {...other}
        >
            {value === index && (
                <Box sx={{ p: 2 }}>
                    {children}
                </Box>
            )}
        </div>
    );
}

export const HistorySelector: React.FC<HistorySelectorProps> = ({ open, onClose, onLoad }) => {
    const [tabValue, setTabValue] = useState(0);
    const [localHistory, setLocalHistory] = useState<RatingSessionSummary[]>([]);
    const [remoteHistory, setRemoteHistory] = useState<RatingSessionSummary[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (open) {
            loadData();
        }
    }, [open]);

    const loadData = async () => {
        setLoading(true);
        try {
            // Load Local
            const local = await getSessionList();
            setLocalHistory(local);

            // Load Remote
            try {
                const response = await axios.get('http://localhost:8000/api/history/list');
                setRemoteHistory(response.data);
            } catch (err) {
                console.error("Failed to load remote history", err);
            }
        } catch (err) {
            console.error("Failed to load history", err);
        } finally {
            setLoading(false);
        }
    };

    const handleLoadLocal = async (id: string) => {
        try {
            const session = await getSessionDetail(id);
            if (session) {
                onLoad(session);
                onClose();
            } else {
                alert("未找到本地记录");
            }
        } catch (err) {
            console.error("Failed to load local session", err);
            alert("加载本地记录失败");
        }
    };

    const handleDeleteLocal = async (id: string, event: React.MouseEvent) => {
        event.stopPropagation(); // Prevent loading the session when clicking delete
        if (!window.confirm("确定要删除这条本地记录吗？")) return;
        
        try {
            await deleteSession(id);
            setLocalHistory(prev => prev.filter(item => item.id !== id));
        } catch (err) {
            console.error("Failed to delete local session", err);
            alert("删除本地记录失败");
        }
    };

    const handleLoadRemote = async (id: string) => {
        try {
            const response = await axios.get(`http://localhost:8000/api/history/${id}`);
            // Backend returns HistoryItem with actual session in 'data' field
            const historyItem = response.data;
            if (historyItem && historyItem.data) {
                onLoad(historyItem.data);
            } else {
                onLoad(historyItem);
            }
            onClose();
        } catch (err) {
            console.error("Failed to load remote session", err);
            alert("Failed to load remote session");
        }
    };

    const handleDeleteRemote = async (id: string, event: React.MouseEvent) => {
        event.stopPropagation(); // Prevent loading the session when clicking delete
        if (!window.confirm("确定要删除这条云端记录吗？这将同时删除 GitHub 上的备份。")) return;
        
        try {
            await axios.delete(`http://localhost:8000/api/history/${id}`);
            setRemoteHistory(prev => prev.filter(item => item.id !== id));
        } catch (err) {
            console.error("Failed to delete remote session", err);
            alert("删除云端记录失败");
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>History Records</DialogTitle>
            <DialogContent>
                <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
                        <Tab icon={<StorageIcon />} label="Local Storage" />
                        <Tab icon={<CloudIcon />} label="Remote Repository" />
                    </Tabs>
                </Box>
                
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <>
                        <TabPanel value={tabValue} index={0}>
                            {localHistory.length === 0 ? (
                                <Typography color="text.secondary" align="center">No local records found</Typography>
                            ) : (
                                <List>
                                    {localHistory.map((item) => (
                                        <ListItem key={item.id} disablePadding
                                            secondaryAction={
                                                <IconButton edge="end" aria-label="delete" onClick={(e) => handleDeleteLocal(item.id, e)}>
                                                    <DeleteIcon />
                                                </IconButton>
                                            }
                                        >
                                            <ListItemButton onClick={() => handleLoadLocal(item.id)}>
                                                <ListItemText 
                                                    primary={item.examName} 
                                                    secondary={`Created: ${new Date(item.createdAt).toLocaleString()} | Questions: ${item.questionCount}`} 
                                                />
                                                <Chip label="Local" size="small" color="primary" variant="outlined" />
                                            </ListItemButton>
                                        </ListItem>
                                    ))}
                                </List>
                            )}
                        </TabPanel>
                        <TabPanel value={tabValue} index={1}>
                             {remoteHistory.length === 0 ? (
                                <Typography color="text.secondary" align="center">No remote records found</Typography>
                            ) : (
                                <List>
                                    {remoteHistory.map((item) => (
                                        <ListItem key={item.id} disablePadding
                                            secondaryAction={
                                                <IconButton edge="end" aria-label="delete" onClick={(e) => handleDeleteRemote(item.id, e)}>
                                                    <DeleteIcon />
                                                </IconButton>
                                            }
                                        >
                                            <ListItemButton onClick={() => handleLoadRemote(item.id)}>
                                                <ListItemText 
                                                    primary={item.examName} 
                                                    secondary={`Created: ${new Date(item.createdAt).toLocaleString()} | Questions: ${item.questionCount}`} 
                                                />
                                                <Chip label="Remote" size="small" color="secondary" variant="outlined" />
                                            </ListItemButton>
                                        </ListItem>
                                    ))}
                                </List>
                            )}
                        </TabPanel>
                    </>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Close</Button>
            </DialogActions>
        </Dialog>
    );
};
