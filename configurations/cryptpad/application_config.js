/*
 * You can override the configurable values from this file.
 * The recommended method is to make a copy of this file (/customize.dist/application_config.js)
   in a 'customize' directory (/customize/application_config.js).
 * If you want to check all the configurable values, you can open the internal configuration file
   but you should not change it directly (/common/application_config_internal.js)
*/
define(['/common/application_config_internal.js'], function (AppConfig) {
    AppConfig.surveyURL = "";
    AppConfig.availablePadTypes = ['drive', 'pad', 'sheet', 'code'];
    AppConfig.registeredOnlyTypes = ['drive', 'pad', 'sheet', 'code'];
    AppConfig.hideLoadingScreenTips = true;
    AppConfig.availableLanguages = ['en'];
    AppConfig.disableAnonymousStore = true;
    AppConfig.disableAnonymousPadCreation = true
    AppConfig.disableCrowdfundingMessages = true;
    AppConfig.logFeedback = false;

    return AppConfig;
});
