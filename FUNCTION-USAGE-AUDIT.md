# Static Function Usage Audit

Audit date: 2026-10-14

## Scope and method

Scanned function declarations in `google-apps-script.gs` and `assets/js/*.js`, excluding vendor/minified assets. For each function, counted identifier text in the same file, excluding its declaration, using regex. This is a heuristic, not an AST/call graph; comments/string literals may count, and runtime/dynamic callers may not. Counts are signals, not grounds to delete by themselves. Apps Script entry points, trigger handlers, editor-invoked admin functions, and README references were checked separately.

Inventory: 134 Apps Script + 134 front-end JavaScript = 268 functions. All front-end functions have at least one identifier reference within their own file.

## Per-function inventory

| File | Line | Function | In-file references | Recommendation |
|---|---:|---|---:|---|
| google-apps-script.gs | 44 | `doGet` | 0 | Keep: Apps Script Web App runtime entry point |
| google-apps-script.gs | 87 | `doPost` | 0 | Keep: Apps Script Web App runtime entry point |
| google-apps-script.gs | 283 | `submitTeacherApplication_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 316 | `approveTeacherByToken_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 341 | `approveTeacher` | 2 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 372 | `listPendingTeacherApplications` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 381 | `approveTeacherByEmail` | 0 | Verify admin usage; manually callable despite no source caller |
| google-apps-script.gs | 394 | `teacherLogin_` | 2 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 410 | `getActiveTeacherEmail_` | 2 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 422 | `findAttitudeRecord_` | 3 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 436 | `lookupAttitudeScore_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 449 | `lookupAttitudeScores_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 496 | `getAttitudeScoreResult_` | 2 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 523 | `getAttitudeName_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 538 | `saveAttitudeScore_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 591 | `saveAttitudeScores_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 685 | `onEdit` | 1 | Keep: Apps Script simple edit trigger entry point |
| google-apps-script.gs | 694 | `setupLearningSummarySync` | 0 | Keep: manual trigger installer; documented in README |
| google-apps-script.gs | 710 | `syncLearningSummaryOnEdit` | 2 | Keep: handler installed by setupLearningSummarySync |
| google-apps-script.gs | 735 | `recalculateAttitudeScoreRows_` | 3 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 758 | `getQuizIndexHeaders_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 767 | `getOrCreateQuizIndexSheet_` | 5 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 813 | `createQuiz_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 875 | `listQuizzes_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 890 | `getQuiz_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 970 | `submitQuiz_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1103 | `buildQuizSubmissionResponse_` | 2 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1119 | `getQuizPhaseSummary_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1169 | `getCompactQuizResultHeaders_` | 3 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1177 | `pruneUnusedQuizResultColumns_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1192 | `getOrCreateQuizResultsSheet_` | 3 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1198 | `getQuizResultHeaders_` | 3 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1210 | `countQuizAttempts_` | 3 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1214 | `getQuizPassRule_` | 3 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1222 | `hasPassedPostTest_` | 2 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1228 | `isQuizScorePassed_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1237 | `getQuizAttemptHistoryRows_` | 2 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1262 | `getOrCreateQuizAttemptHistorySheet_` | 5 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1293 | `appendQuizAttemptHistory_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1309 | `findQuizAttemptById_` | 2 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1338 | `appendQuizAttemptPhaseView_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1358 | `updateQuizAttemptPhaseViews_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1411 | `compareLookupIds_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1422 | `getQuizAttemptPhaseViews_` | 4 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1430 | `hasQuizAttempt_` | 2 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1434 | `appendQuizResult_` | 2 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1522 | `sortQuizResultsSheet_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1530 | `findQuizMetadata_` | 2 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1551 | `findQuizMetadataByTitle_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1579 | `isQuizOpen_` | 2 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1586 | `distanceBetweenCoordinatesMeters_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1596 | `isValidDateRange_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1603 | `normalizePhase_` | 18 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1614 | `formatPhaseLabel_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1626 | `normalizeQuizTitle_` | 2 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1633 | `shuffleServer_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1637 | `shuffleForSeed_` | 2 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1652 | `getOrCreateSheet_` | 13 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1667 | `ensureSheetColumns_` | 10 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1673 | `hashPassword_` | 2 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1678 | `saveAttendance_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1755 | `setupRegistrationSheet` | 0 | Keep: manual setup/admin entry point |
| google-apps-script.gs | 1764 | `normalizeAllLookupIds` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1772 | `normalizeLookupColumnsByName_` | 3 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1785 | `authorizeMailApp` | 0 | Verify need: manual email authorization helper |
| google-apps-script.gs | 1794 | `resendTeacherApprovalEmail` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1812 | `buildApprovalEmailHtml_` | 2 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1837 | `setupTacticalScoreSystem` | 0 | Keep: manual setup/admin entry point; installs daily trigger |
| google-apps-script.gs | 1858 | `rotateTacticalScoreAccessCode` | 2 | Keep: time-driven trigger handler |
| google-apps-script.gs | 1868 | `getTacticalScoreSheet_` | 3 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1875 | `writeNewTacticalScoreAccessCode_` | 4 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1883 | `getCurrentTacticalScoreAccessCode_` | 4 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1895 | `validateTacticalScoreCode_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1904 | `submitTacticalScores_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 1996 | `getSpecialAssessmentHeaders_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 2003 | `getOrCreateSpecialAssessmentIndex_` | 4 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 2011 | `listSpecialAssessments_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 2025 | `listAnnouncementGalleryImages_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 2046 | `getOrCreateAnnouncementsSheet_` | 3 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 2054 | `listAnnouncements_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 2096 | `createAnnouncement_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 2136 | `parseAnnouncementDate_` | 2 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 2145 | `deleteExpiredAnnouncementsFromSheet_` | 3 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 2160 | `cleanupExpiredAnnouncements_` | 2 | Keep: time-driven trigger handler |
| google-apps-script.gs | 2172 | `ensureAnnouncementCleanupTrigger_` | 2 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 2180 | `setupAnnouncementCleanup` | 0 | Keep: manual trigger installer; documented in README |
| google-apps-script.gs | 2185 | `getTeacherDashboard_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 2335 | `isDaytimeAttackQuizTitle_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 2341 | `countUniqueLearnersInSheet_` | 2 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 2359 | `countUniqueLearnersByEpisode_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 2407 | `findSpecialAssessment_` | 3 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 2426 | `createSpecialAssessment_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 2477 | `validateSpecialAssessmentCode_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 2486 | `submitSpecialAssessment_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 2558 | `lookupStudent_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 2583 | `lookupScoreStudents_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 2643 | `lookupAttendance_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 2666 | `attendanceStudentLogin_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 2715 | `getLearningSummaryHeaders_` | 7 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 2723 | `getAttendanceHeaders_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 2730 | `getOrCreateLearningSummarySheet_` | 6 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 2738 | `ensureLearningSummaryInitialized_` | 2 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 2757 | `rebuildLearningSummary` | 1 | Keep: manual rebuild entry point; documented in README |
| google-apps-script.gs | 2768 | `rebuildLearningSummary_` | 3 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 2965 | `findLearningSummaryRowByPersonalId_` | 3 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 2975 | `findLearningSummaryRowByLookupId_` | 2 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 2985 | `writeLearningSummaryPatch_` | 4 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 3010 | `updateLearningSummaryAfterSourceWrite_` | 7 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 3019 | `syncLearningSummaryAttendance_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 3037 | `syncLearningSummaryScoresByLookupId_` | 4 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 3046 | `syncLearningSummaryQuizResult_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 3055 | `syncLearningSummarySpecialAssessment_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 3077 | `refreshLearningSummaryScoresForStudent_` | 2 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 3165 | `findRegistrationRecord_` | 6 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 3194 | `findStudentRecord_` | 4 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 3211 | `getSourceSheet_` | 2 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 3224 | `getOrCreateRegistrationSheet_` | 2 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 3245 | `removeRegistrationSubjectColumn_` | 2 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 3253 | `getRegistrationSpreadsheet_` | 37 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 3266 | `createUniqueRegistrationId_` | 0 | Unused candidate: no in-file caller; TODO to verify legacy flow before removal |
| google-apps-script.gs | 3277 | `findRegistrationDuplicates_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 3294 | `normalizeRegistrationLookupColumns_` | 0 | Unused candidate: no in-file caller; TODO to verify legacy migration before removal |
| google-apps-script.gs | 3308 | `sortRegistrationSheet_` | 2 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 3318 | `getRegistrationSheet_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 3330 | `getOrCreateAttendanceSheet_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 3341 | `ensureAttendanceSubjectSchema_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 3414 | `normalizeAttendanceLookupColumns_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 3428 | `attendanceDuplicateExists_` | 1 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 3447 | `sortAttendanceSheet_` | 2 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 3456 | `isValidEmail_` | 4 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 3460 | `normalizeValue_` | 274 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 3464 | `normalizeLookupId_` | 54 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 3471 | `getErrorMessage_` | 9 | Keep: at least one in-file identifier reference |
| google-apps-script.gs | 3475 | `jsonResponse_` | 144 | Keep: at least one in-file identifier reference |
| assets/js/announcement-gallery.js | 20 | `postAnnouncementApi` | 3 | Keep: at least one in-file identifier reference |
| assets/js/announcement-gallery.js | 36 | `setAnnouncementStatus` | 16 | Keep: at least one in-file identifier reference |
| assets/js/announcement-gallery.js | 42 | `formatAnnouncementDate` | 2 | Keep: at least one in-file identifier reference |
| assets/js/announcement-gallery.js | 50 | `renderAnnouncements` | 1 | Keep: at least one in-file identifier reference |
| assets/js/announcement-gallery.js | 96 | `loadAnnouncements` | 2 | Keep: at least one in-file identifier reference |
| assets/js/announcement-gallery.js | 112 | `openAnnouncementEditor` | 1 | Keep: at least one in-file identifier reference |
| assets/js/announcement-gallery.js | 129 | `getLocalDateTimeValue` | 2 | Keep: at least one in-file identifier reference |
| assets/js/announcement-gallery.js | 135 | `closeAnnouncementEditor` | 4 | Keep: at least one in-file identifier reference |
| assets/js/announcement-gallery.js | 149 | `closeDashboard` | 3 | Keep: at least one in-file identifier reference |
| assets/js/announcement-gallery.js | 290 | `setStatus` | 7 | Keep: at least one in-file identifier reference |
| assets/js/announcement-gallery.js | 296 | `closeDownloadNotice` | 3 | Keep: at least one in-file identifier reference |
| assets/js/announcement-gallery.js | 312 | `stopAutoplay` | 4 | Keep: at least one in-file identifier reference |
| assets/js/announcement-gallery.js | 317 | `startAutoplay` | 3 | Keep: at least one in-file identifier reference |
| assets/js/announcement-gallery.js | 323 | `cancelNextImagePreload` | 2 | Keep: at least one in-file identifier reference |
| assets/js/announcement-gallery.js | 331 | `preloadNextImage` | 1 | Keep: at least one in-file identifier reference |
| assets/js/announcement-gallery.js | 345 | `showImage` | 6 | Keep: at least one in-file identifier reference |
| assets/js/announcement-gallery.js | 369 | `closeGallery` | 3 | Keep: at least one in-file identifier reference |
| assets/js/announcement-gallery.js | 386 | `openGallery` | 1 | Keep: at least one in-file identifier reference |
| assets/js/attendance-registration.js | 23 | `setGlobalLoading` | 4 | Keep: at least one in-file identifier reference |
| assets/js/attendance-registration.js | 34 | `parseResponse` | 2 | Keep: at least one in-file identifier reference |
| assets/js/attendance-registration.js | 42 | `escapeHtml` | 3 | Keep: at least one in-file identifier reference |
| assets/js/attendance-registration.js | 48 | `setMessage` | 6 | Keep: at least one in-file identifier reference |
| assets/js/attendance-registration.js | 59 | `resetForm` | 3 | Keep: at least one in-file identifier reference |
| assets/js/attendance-registration.js | 68 | `closeModal` | 2 | Keep: at least one in-file identifier reference |
| assets/js/attendance-registration.js | 74 | `showPopup` | 1 | Keep: at least one in-file identifier reference |
| assets/js/attendance-registration.js | 79 | `validateStudentId` | 2 | Keep: at least one in-file identifier reference |
| assets/js/attendance-registration.js | 87 | `renderColumns` | 1 | Keep: at least one in-file identifier reference |
| assets/js/exam.js | 42 | `syncPhaseSelector` | 1 | Keep: at least one in-file identifier reference |
| assets/js/exam.js | 50 | `setLoading` | 4 | Keep: at least one in-file identifier reference |
| assets/js/exam.js | 54 | `setError` | 6 | Keep: at least one in-file identifier reference |
| assets/js/exam.js | 61 | `escapeHtml` | 3 | Keep: at least one in-file identifier reference |
| assets/js/exam.js | 67 | `request` | 6 | Keep: at least one in-file identifier reference |
| assets/js/exam.js | 74 | `formatPhaseLabel` | 6 | Keep: at least one in-file identifier reference |
| assets/js/exam.js | 85 | `normalizeTitle` | 2 | Keep: at least one in-file identifier reference |
| assets/js/exam.js | 89 | `refreshQuizMenu` | 2 | Keep: at least one in-file identifier reference |
| assets/js/exam.js | 153 | `findQuizId` | 1 | Keep: at least one in-file identifier reference |
| assets/js/exam.js | 173 | `getCurrentCoordinates` | 1 | Keep: at least one in-file identifier reference |
| assets/js/exam.js | 192 | `loadStudentInfo` | 1 | Keep: at least one in-file identifier reference |
| assets/js/exam.js | 206 | `renderStudentInfo` | 2 | Keep: at least one in-file identifier reference |
| assets/js/exam.js | 234 | `closeExam` | 2 | Keep: at least one in-file identifier reference |
| assets/js/exam.js | 262 | `updateTimer` | 2 | Keep: at least one in-file identifier reference |
| assets/js/exam.js | 280 | `renderQuestion` | 2 | Keep: at least one in-file identifier reference |
| assets/js/exam.js | 305 | `beginExam` | 2 | Keep: at least one in-file identifier reference |
| assets/js/google-sheet-form.js | 27 | `setGlobalLoading` | 4 | Keep: at least one in-file identifier reference |
| assets/js/google-sheet-form.js | 34 | `parseResponse` | 2 | Keep: at least one in-file identifier reference |
| assets/js/google-sheet-form.js | 42 | `setMessage` | 8 | Keep: at least one in-file identifier reference |
| assets/js/google-sheet-form.js | 54 | `showRegistrationPopup` | 1 | Keep: at least one in-file identifier reference |
| assets/js/google-sheet-form.js | 62 | `resetRegistrationForm` | 4 | Keep: at least one in-file identifier reference |
| assets/js/google-sheet-form.js | 85 | `closeRegistrationModal` | 3 | Keep: at least one in-file identifier reference |
| assets/js/google-sheet-form.js | 123 | `escapeHtml` | 8 | Keep: at least one in-file identifier reference |
| assets/js/google-sheet-form.js | 133 | `validateLookupId` | 1 | Keep: at least one in-file identifier reference |
| assets/js/google-sheet-form.js | 141 | `validateRegistrationLookupId` | 1 | Keep: at least one in-file identifier reference |
| assets/js/google-sheet-form.js | 149 | `validateRegistrationId` | 1 | Keep: at least one in-file identifier reference |
| assets/js/google-sheet-form.js | 157 | `validateEpisode` | 1 | Keep: at least one in-file identifier reference |
| assets/js/google-sheet-form.js | 165 | `lookupStudent` | 1 | Keep: at least one in-file identifier reference |
| assets/js/main.js | 15 | `toggleScrolled` | 2 | Keep: at least one in-file identifier reference |
| assets/js/main.js | 30 | `mobileNavToogle` | 2 | Keep: at least one in-file identifier reference |
| assets/js/main.js | 81 | `toggleScrollTop` | 2 | Keep: at least one in-file identifier reference |
| assets/js/main.js | 100 | `aosInit` | 2 | Keep: at least one in-file identifier reference |
| assets/js/main.js | 129 | `initSwiper` | 1 | Keep: at least one in-file identifier reference |
| assets/js/main.js | 189 | `navmenuScrollspy` | 2 | Keep: at least one in-file identifier reference |
| assets/js/quiz-builder.js | 47 | `loadMapLibrary` | 1 | Keep: at least one in-file identifier reference |
| assets/js/quiz-builder.js | 69 | `updateLocationMarker` | 3 | Keep: at least one in-file identifier reference |
| assets/js/quiz-builder.js | 88 | `showLocationMap` | 1 | Keep: at least one in-file identifier reference |
| assets/js/quiz-builder.js | 112 | `setCurrentTeacherEmail` | 2 | Keep: at least one in-file identifier reference |
| assets/js/quiz-builder.js | 118 | `syncPassingControls` | 7 | Keep: at least one in-file identifier reference |
| assets/js/quiz-builder.js | 142 | `resetLocationSettings` | 2 | Keep: at least one in-file identifier reference |
| assets/js/quiz-builder.js | 160 | `showModal` | 1 | Keep: at least one in-file identifier reference |
| assets/js/quiz-builder.js | 165 | `hideModal` | 6 | Keep: at least one in-file identifier reference |
| assets/js/quiz-builder.js | 172 | `showAuthChoice` | 4 | Keep: at least one in-file identifier reference |
| assets/js/quiz-builder.js | 179 | `showAuthForm` | 2 | Keep: at least one in-file identifier reference |
| assets/js/quiz-builder.js | 186 | `showTeacherMenu` | 2 | Keep: at least one in-file identifier reference |
| assets/js/quiz-builder.js | 191 | `enterExamManagement` | 1 | Keep: at least one in-file identifier reference |
| assets/js/quiz-builder.js | 196 | `renderTeacherDashboard` | 1 | Keep: at least one in-file identifier reference |
| assets/js/quiz-builder.js | 236 | `loadTeacherDashboard` | 2 | Keep: at least one in-file identifier reference |
| assets/js/quiz-builder.js | 256 | `clearBuilderState` | 5 | Keep: at least one in-file identifier reference |
| assets/js/quiz-builder.js | 279 | `showQuizSuccessPopup` | 1 | Keep: at least one in-file identifier reference |
| assets/js/quiz-builder.js | 286 | `setStatus` | 16 | Keep: at least one in-file identifier reference |
| assets/js/quiz-builder.js | 294 | `setLoading` | 7 | Keep: at least one in-file identifier reference |
| assets/js/quiz-builder.js | 304 | `request` | 4 | Keep: at least one in-file identifier reference |
| assets/js/quiz-builder.js | 333 | `parseCsv` | 3 | Keep: at least one in-file identifier reference |
| assets/js/quiz-builder.js | 349 | `sanitizeChoiceValue` | 10 | Keep: at least one in-file identifier reference |
| assets/js/quiz-builder.js | 354 | `normalizeAnswerValue` | 3 | Keep: at least one in-file identifier reference |
| assets/js/quiz-builder.js | 368 | `rowsFromCells` | 4 | Keep: at least one in-file identifier reference |
| assets/js/quiz-builder.js | 402 | `loadXlsxLibrary` | 1 | Keep: at least one in-file identifier reference |
| assets/js/quiz-builder.js | 422 | `readFile` | 1 | Keep: at least one in-file identifier reference |
| assets/js/quiz-builder.js | 430 | `readGoogleSheet` | 1 | Keep: at least one in-file identifier reference |
| assets/js/quiz-builder.js | 439 | `validateQuestions` | 1 | Keep: at least one in-file identifier reference |
| assets/js/quiz-builder.js | 476 | `renderPreview` | 2 | Keep: at least one in-file identifier reference |
| assets/js/quiz-builder.js | 497 | `downloadTemplateCsv` | 1 | Keep: at least one in-file identifier reference |
| assets/js/quiz-builder.js | 520 | `getQuestions` | 2 | Keep: at least one in-file identifier reference |
| assets/js/special-assessment.js | 31 | `setStatus` | 27 | Keep: at least one in-file identifier reference |
| assets/js/special-assessment.js | 38 | `post` | 4 | Keep: at least one in-file identifier reference |
| assets/js/special-assessment.js | 49 | `loadAssessments` | 2 | Keep: at least one in-file identifier reference |
| assets/js/special-assessment.js | 72 | `showEntryForm` | 2 | Keep: at least one in-file identifier reference |
| assets/js/special-assessment.js | 79 | `openBuilder` | 1 | Keep: at least one in-file identifier reference |
| assets/js/special-assessment.js | 86 | `closeBuilder` | 1 | Keep: at least one in-file identifier reference |
| assets/js/special-assessment.js | 92 | `closeEntry` | 2 | Keep: at least one in-file identifier reference |
| assets/js/special-assessment.js | 107 | `updateRowTotal` | 3 | Keep: at least one in-file identifier reference |
| assets/js/special-assessment.js | 116 | `createHeader` | 3 | Keep: at least one in-file identifier reference |
| assets/js/special-assessment.js | 123 | `createInput` | 2 | Keep: at least one in-file identifier reference |
| assets/js/special-assessment.js | 131 | `buildTable` | 2 | Keep: at least one in-file identifier reference |
| assets/js/special-assessment.js | 181 | `lookupStudent` | 1 | Keep: at least one in-file identifier reference |
| assets/js/special-assessment.js | 213 | `clearStudentRow` | 1 | Keep: at least one in-file identifier reference |
| assets/js/special-assessment.js | 220 | `scheduleStudentLookups` | 2 | Keep: at least one in-file identifier reference |
| assets/js/special-assessment.js | 225 | `lookupStudents` | 1 | Keep: at least one in-file identifier reference |
| assets/js/special-assessment.js | 277 | `openAssessment` | 1 | Keep: at least one in-file identifier reference |
| assets/js/tactical-score.js | 25 | `createCopyConfirmation` | 1 | Keep: at least one in-file identifier reference |
| assets/js/tactical-score.js | 76 | `resolveCopyConfirmation` | 4 | Keep: at least one in-file identifier reference |
| assets/js/tactical-score.js | 95 | `setStatus` | 16 | Keep: at least one in-file identifier reference |
| assets/js/tactical-score.js | 102 | `post` | 3 | Keep: at least one in-file identifier reference |
| assets/js/tactical-score.js | 113 | `buildTable` | 1 | Keep: at least one in-file identifier reference |
| assets/js/tactical-score.js | 183 | `updateRowTotal` | 3 | Keep: at least one in-file identifier reference |
| assets/js/tactical-score.js | 192 | `clearStudentRow` | 1 | Keep: at least one in-file identifier reference |
| assets/js/tactical-score.js | 201 | `scheduleStudentLookups` | 2 | Keep: at least one in-file identifier reference |
| assets/js/tactical-score.js | 206 | `lookupStudents` | 1 | Keep: at least one in-file identifier reference |
| assets/js/tactical-score.js | 257 | `closeModal` | 4 | Keep: at least one in-file identifier reference |
| assets/js/tactical-score.js | 335 | `confirmAndCopyFirstRowScores` | 2 | Keep: at least one in-file identifier reference |
| assets/js/teacher-attitude.js | 26 | `setStatus` | 16 | Keep: at least one in-file identifier reference |
| assets/js/teacher-attitude.js | 33 | `post` | 2 | Keep: at least one in-file identifier reference |
| assets/js/teacher-attitude.js | 49 | `setRowLoaded` | 1 | Keep: at least one in-file identifier reference |
| assets/js/teacher-attitude.js | 66 | `clearRow` | 6 | Keep: at least one in-file identifier reference |
| assets/js/teacher-attitude.js | 78 | `updateScore` | 2 | Keep: at least one in-file identifier reference |
| assets/js/teacher-attitude.js | 88 | `loadPendingRows` | 1 | Keep: at least one in-file identifier reference |
| assets/js/teacher-attitude.js | 148 | `scheduleLookup` | 1 | Keep: at least one in-file identifier reference |
| assets/js/teacher-attitude.js | 153 | `createRow` | 1 | Keep: at least one in-file identifier reference |
| assets/js/teacher-attitude.js | 175 | `resetRows` | 3 | Keep: at least one in-file identifier reference |
| assets/js/teacher-attitude.js | 189 | `closePopup` | 2 | Keep: at least one in-file identifier reference |
| assets/js/teaching-management.js | 25 | `setValue` | 13 | Keep: at least one in-file identifier reference |
| assets/js/teaching-management.js | 30 | `setLoginStatus` | 5 | Keep: at least one in-file identifier reference |
| assets/js/teaching-management.js | 37 | `renderAssessments` | 2 | Keep: at least one in-file identifier reference |
| assets/js/teaching-management.js | 52 | `showLogin` | 2 | Keep: at least one in-file identifier reference |
| assets/js/teaching-management.js | 59 | `showDashboard` | 2 | Keep: at least one in-file identifier reference |
| assets/js/teaching-management.js | 85 | `closeApp` | 2 | Keep: at least one in-file identifier reference |

## Findings

- No front-end dead-code candidate was identified by this heuristic; retain all 134 functions.
- Keep Apps Script runtime entry points and functions run manually from the editor or invoked by installed triggers, even when source call counts are zero. README explicitly documents `setupAnnouncementCleanup`, `setupLearningSummarySync`, and `rebuildLearningSummary`.
- Two internal utilities have no in-file caller and are not mentioned in repository documentation: `createUniqueRegistrationId_` and `normalizeRegistrationLookupColumns_`. TODO comments were added at their declarations; confirm legacy/admin scripts do not depend on them before deletion. No functions were deleted.

## Trigger verification

Source code installs `syncLearningSummaryOnEdit` (on edit), `cleanupExpiredAnnouncements_` (hourly), and `rotateTacticalScoreAccessCode` (daily). The `clasp` command is unavailable in this environment, so actual installed production trigger instances could not be queried. In Apps Script > Triggers (clock icon), signed in as the script owner, verify all three handlers, event source/type, and absence of duplicates.

## Limitations

This static scan cannot prove runtime reachability or cover dynamic references, external menus/configuration, inline HTML handlers, or triggers actually installed in the live project.
