import { useState, useEffect, useReducer } from 'react';
import { CircularProgress, Container, Paper, Box, Typography, Grid, Button } from '@mui/material';
import apiClient from '../apiClient';
import { EditExamData, GetExamInfoResult } from '../api';
import { DashboardContainer } from '../components/containers/dashboardContainer';
import { CurrentAppTranslation } from '../translations/appTranslation';
import useAppSnackbar from '../components/snackbars/useAppSnackbars';
import { extractErrorDetails } from '../utils/errorUtils';
import { autoSetWindowTitle, getFieldOf } from '../utils/commonUtils';
import { getDateFromServerTimestamp, getUTCUnixTimestamp } from '../utils/timeUtils';
import RenderAllFields from '../components/rendering/RenderAllFields';

export var forceUpdateExamInfoPage = () => { };

interface DisplayingExamData extends EditExamData {
    has_participated?: boolean;
    has_started?: boolean;
    has_finished?: boolean;
}

var ExamCountdownId = 0;

const ExamInfoPage = () => {
    const [examData, setExamData] = useState<DisplayingExamData>({
        exam_id: 0,
        course_id: 0,
        exam_title: '',
        exam_description: '',
        price: '0T',
        duration: 60,
        exam_date: 0,
        is_public: false,
    });
    const [examInfo, setExamInfo] = useState<GetExamInfoResult | null>(null);
    const [, forceUpdate] = useReducer(x => x + 1, 0);
    const [isEditing, setIsEditing] = useState(false);
    const [isExamNotFound, setIsUserNotFound] = useState(false);
    const snackbar = useAppSnackbar();

    forceUpdateExamInfoPage = () => {
        forceUpdate();
    };

    const fetchExamInfo = async () => {
        // the exam id is passed like /examInfo?examId=123
        const urlSearch = new URLSearchParams(window.location.search);
        const targetExamId = parseInt(urlSearch.get('examId') ?? '');
        const isEditingQuery = urlSearch.get('edit');
        if (!targetExamId || isNaN(targetExamId)) {
            window.location.href = '/searchExam';
            return;
        }

        setIsEditing(isEditingQuery === '1' || isEditingQuery === 'true');

        try {
            const result = await apiClient.getExamInfo(targetExamId);
            setExamData({
                exam_id: result.exam_id,
                course_id: result.course_id,
                exam_title: result.exam_title,
                exam_description: result.exam_description,
                price: result.price,
                duration: result.duration,
                exam_date: getUTCUnixTimestamp(getDateFromServerTimestamp(result.exam_date)!),
                is_public: result.is_public,
                has_participated: result.has_participated,
                has_finished: result.has_finished,
                has_started: result.has_started,
            });
            setExamInfo(result);

            if (examInfo?.can_participate && !examInfo.has_started && !examInfo.has_finished) {
                ExamCountdownId = window.setInterval(() => {
                    if (!examInfo.starts_in || examInfo.starts_in < 0) {
                        clearInterval(ExamCountdownId);

                        // automatically redirect the user to the exam hall
                        setTimeout(() => {
                            window.location.href = `/examHall?examId=${targetExamId}`;
                        }, 5000);
                    }

                    setExamInfo({
                        ...examInfo,
                        starts_in: examInfo.starts_in! - 1,
                    });
                }, 60000);
            }
        } catch (error: any) {
            const [errCode, errMessage] = extractErrorDetails(error);
            snackbar.error(`Failed to get exam info (${errCode}): ${errMessage}`);
            setIsUserNotFound(true);
            return;
        }
    };

    useEffect(() => {
        fetchExamInfo();

        autoSetWindowTitle();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleEdit = () => {
        window.history.pushState(
            `examInfo_examId_${examData.exam_id}`,
            "Exam Info",
            `${window.location.pathname}?examId=${encodeURIComponent(examData.exam_id!)
            }&edit=${isEditing ? '0' : '1'
            }`,
        );
        setIsEditing(!isEditing);
    }

    const handleChange = (e: any) => {
        let targetValue: any = e.target.value;
        if (getFieldOf(targetValue, "_d") instanceof Date) {
            targetValue = getFieldOf(targetValue, "_d");
        }

        if (targetValue instanceof Date) {
            // convert to UTC
            targetValue = getUTCUnixTimestamp(targetValue);
        }
        setExamData({
            ...examData,
            [e.target.name]: targetValue,
        });
    };

    const handleSave = async () => {
        try {
            const result = await apiClient.editExam(examData);
            const updatedUserData: any = { ...examData };
            Object.keys(result).forEach(key => {
                if (key in examData) {
                    updatedUserData[key] = result[key as keyof (typeof result)];
                }
            });

            setExamData(updatedUserData);
            setIsEditing(false);

            window.history.pushState(
                `examInfo_examId_${examData.exam_id}`,
                "Exam Info",
                `${window.location.pathname}?examId=${encodeURIComponent(examData.exam_id!)
                }&edit=${isEditing ? '0' : '1'}`,
            );
        } catch (error: any) {
            const [errCode, errMessage] = extractErrorDetails(error);
            snackbar.error(`Failed (${errCode}) - ${errMessage}`);
            return;
        }
    };

    const handleParticipate = async () => {
        try {
            const result = await apiClient.participateExam({
                exam_id: examData.exam_id,
                price: examData.price,
                user_id: apiClient.getCurrentUserId()!,
            });
            snackbar.success(CurrentAppTranslation.ExamParticipationSuccessText);
            setExamInfo({
                ...examInfo!,
                has_participated: true,
                question_count: result.question_count,
            });
        } catch (error: any) {
            const [errCode, errMessage] = extractErrorDetails(error);
            snackbar.error(`Failed (${errCode}) - ${errMessage}`);
            return;
        }
    };

    const handleExamHall = () => {
        window.location.href = `/examHall?examId=${examData.exam_id}`;
    }

    if (!examData) {
        // maybe return better stuff here in future?
        return (
            <DashboardContainer>
                <CircularProgress />
            </DashboardContainer>
        );
    }

    if (isExamNotFound) {
        return (
            <DashboardContainer>
                <Typography>{CurrentAppTranslation.ExamNotFoundText}</Typography>
            </DashboardContainer>
        );
    }

    return (
        <DashboardContainer>
            <Container maxWidth="sm">
                <Paper elevation={3} sx={{ p: 3, mt: 4 }}>
                    <Typography variant="h4" style={{
                        textAlign: 'center',
                    }} gutterBottom>
                        {CurrentAppTranslation.ExamInformationText}
                    </Typography>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                        {examInfo?.can_edit_question && (
                            <Button variant="contained" onClick={isEditing ? handleSave : handleEdit}>
                                {isEditing ? CurrentAppTranslation.SaveText : CurrentAppTranslation.EditText}
                            </Button>
                        )}
                        {(!isEditing && examInfo?.can_participate &&
                            !examInfo.has_participated &&
                            !examInfo.has_finished && !examInfo.can_edit_question) && (
                                <Button variant="contained" onClick={handleParticipate}>
                                    {CurrentAppTranslation.ParticipateText}
                                </Button>
                            )}
                        {(!isEditing && examInfo?.can_edit_question) && (
                            <Button variant="contained" onClick={handleExamHall}>
                                {CurrentAppTranslation.QuestionsText}
                            </Button>
                        )}
                        {(!isEditing && examInfo?.has_participated && examInfo.has_started) && (
                            <Button variant="contained" onClick={handleExamHall}>
                                {CurrentAppTranslation.ExamHallText}
                            </Button>
                        )}
                    </Box>
                    <hr />
                    <Grid container spacing={2}>
                        {RenderAllFields({
                            data: examData,
                            handleInputChange: handleChange,
                            isEditing: isEditing,
                            disablePast: true,
                            disableDateTimePickers: examInfo?.has_finished,
                            noEditFields: [
                                'exam_id',
                                'has_participated',
                                'has_started',
                                'has_finished',
                            ],
                        })}
                    </Grid>
                </Paper>
            </Container>
        </DashboardContainer>
    );
};

export default ExamInfoPage;