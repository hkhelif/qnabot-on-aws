/*********************************************************************************************************************
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.                                                *
 *                                                                                                                    *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance    *
 *  with the License. A copy of the License is located at                                                             *
 *                                                                                                                    *
 *      http://www.apache.org/licenses/                                                                               *
 *                                                                                                                    *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES *
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions    *
 *  and limitations under the License.                                                                                *
 *********************************************************************************************************************/

const aws = require('aws-sdk');
const qnabot = require('qnabot/logging');

// start connection
const _ = require('lodash');
const Handlebars = require('handlebars');
const supportedLanguages = require('./supportedLanguages');

let res_glbl = {};
let req_glbl = {};
let autotranslate;

// used by signS3Url helper
function signS3URL(url, expireSecs) {
    let bucket; let
        key;
    if (url.search(/\/s3[.-](\w{2}-\w{4,9}-\d\.)?amazonaws\.com/) != -1) {
        // bucket in path format
        bucket = url.split('/')[3];
        key = url.split('/').slice(4).join('/');
    }
    if (url.search(/\.s3[.-](\w{2}-\w{4,9}-\d\.)?amazonaws\.com/) != -1) {
        // bucket in hostname format
        const hostname = url.split('/')[2];
        bucket = hostname.split('.')[0];
        key = url.split('/').slice(3).join('/');
    }
    if (bucket && key) {
        qnabot.log('Attempt to convert S3 url to a signed URL: ', url);
        qnabot.log('Bucket: ', bucket, ' Key: ', key);
        try {
            const s3 = new aws.S3();
            const signedurl = s3.getSignedUrl('getObject', {
                Bucket: bucket,
                Key: key,
                Expires: expireSecs,
            });
            url = signedurl;
        } catch (err) {
            qnabot.log('Error signing S3 URL (returning original URL): ', err);
        }
    } else {
        qnabot.log('URL is not an S3 url - return unchanged: ', url);
    }
    return url;
}

function convertOperatorToFunc(operator) {
    switch (operator) {
    case '==':
        return (v1, v2) => (v1 == v2);
    case '===':
        return (v1, v2) => (v1 === v2);
    case '!=':
        return (v1, v2) => (v1 != v2);
    case '!==':
        return (v1, v2) => (v1 !== v2);
    case '<':
        return (v1, v2) => (v1 < v2);
    case '<=':
        return (v1, v2) => (v1 <= v2);
    case '>':
        return (v1, v2) => (v1 > v2);
    case '>=':
        return (v1, v2) => (v1 >= v2);
    case '&&':
        return (v1, v2) => (v1 && v2);
    case '||':
        return (v1, v2) => (v1 || v2);
    default:
        return (v1, v2) => false;
    }
}

Handlebars.registerHelper('ifCond', function (v1, operator, v2, options) {
    const evaluationFunction = convertOperatorToFunc(operator);
    return evaluationFunction(v1, v2) ? options.fn(this) : options.inverse(this);
});

Handlebars.registerHelper('ifLang', function (lang, options) {
    const SessionAttributes = _.get(req_glbl, 'session');
    const usrLang = SessionAttributes.qnabotcontext.userLocale;
    if (usrLang && lang === usrLang) {
        _.set(req_glbl.session, 'matchlang', 'true');
        // Disable autotranslation, since we have an explicit language match
        autotranslate = false;
        return options.fn(this);
    }
});

Handlebars.registerHelper('defaultLang', function (options) {
    const SessionAttributes = _.get(req_glbl, 'session');
    const previousMatchLang = SessionAttributes.matchlang;

    if (previousMatchLang && previousMatchLang === 'true') {
        // case one. Hitting the default en lang response and a previous lang has matched. Return nothing and reset matchlang
        // matchlang to false for next processing. Disable autotranslation.
        _.set(req_glbl.session, 'matchlang', 'false');
        autotranslate = false;
        return options.inverse(this);
    }
    if (previousMatchLang && previousMatchLang === 'false') {
        // case two. Hitting the default lang response and a previous lang has NOT matched. Return value. matchlang is
        // false for next processing. Enable autotranslation.
        autotranslate = true;
        return options.fn(this);
    }
    if (previousMatchLang === undefined) {
        // case three. Hitting the default lang response and no previous lang has been encountered. Return default value
        // but set matchlang to false for next processing. Enable autotranslation.
        _.set(req_glbl.session, 'matchlang', 'false');
        autotranslate = true;
        return options.fn(this);
    }
    if (previousMatchLang === undefined) {
        _.set(req_glbl.session, 'matchlang', 'false');
    }
    return options.inverse(this);
});

Handlebars.registerHelper('setLang', function (lang, last, options) {
    if (!_.get(req_glbl._settings, 'ENABLE_MULTI_LANGUAGE_SUPPORT')) {
        qnabot.log('Warning - attempt to use setLang handlebar helper function while ENABLE_MULTI_LANGUAGE_SUPPORT is set to false. Please check configuration.');
        return;
    }

    const userPreferredLocaleKey = 'session.qnabotcontext.userPreferredLocale';
    const userLocaleKey = 'session.qnabotcontext.userLocale';
    const currentPreferredLocale = _.get(res_glbl, userPreferredLocaleKey);
    const currentUserLocale = _.get(res_glbl, userLocaleKey);
    let errorLocale;
    if (currentPreferredLocale) {
        errorLocale = currentPreferredLocale;
    } else {
        errorLocale = currentUserLocale || 'en';
    }
    const capitalize = (s) => {
        if (typeof s !== 'string') return '';
        return s.charAt(0).toUpperCase() + s.slice(1);
    };
    const errorFound = _.get(req_glbl._event, 'errorFound');
    const userLanguage = capitalize(_.get(req_glbl._event, 'inputTranscript'));
    const supported_languages = supportedLanguages.getSupportedLanguages();
    const languageErrorMessages = supportedLanguages.getLanguageErrorMessages();
    const userLanguageCode = supported_languages[userLanguage];

    if (userLanguageCode === undefined && !errorFound) {
        qnabot.log('no language mapping for user utterance');
        _.set(req_glbl._event, 'errorFound', true);
        return languageErrorMessages[errorLocale].errorMessage;
    }

    if (userLanguageCode && lang == userLanguageCode) {
        qnabot.log('Setting language - message: ', options.fn(this));
        qnabot.log('Setting req & res session attribute:', 'session.qnabotcontext.userPreferredLocale', ' Value:', userLanguageCode);
        _.set(res_glbl, userPreferredLocaleKey, userLanguageCode);
        _.set(req_glbl, userPreferredLocaleKey, userLanguageCode);
        _.set(res_glbl, userLocaleKey, userLanguageCode);
        _.set(req_glbl, userLocaleKey, userLanguageCode);
        // setLang message is already localized.. disable autotransaltion
        autotranslate = false;
        return options.fn(this);
    }
    if ((last === true) && (_.get(res_glbl, userPreferredLocaleKey) !== userLanguageCode) && !errorFound) {
        return languageErrorMessages[errorLocale].errorMessage;
    }
    return '';
});

Handlebars.registerHelper('resetLang', (msg, options) => {
    qnabot.log('reset userPreferredLocale to reenable automatic language detection');
    const userPreferredLocaleKey = 'session.qnabotcontext.userPreferredLocale';
    _.set(req_glbl, userPreferredLocaleKey, '');
    _.set(res_glbl, userPreferredLocaleKey, '');
    return msg;
});

Handlebars.registerHelper('setSessionAttr', function () {
    const args = Array.from(arguments);
    const k = args[0];
    // concat remaining arguments to create value
    const v_arr = args.slice(1, args.length - 1); // ignore final 'options' argument
    const v = v_arr.join(''); // concatenate value arguments
    qnabot.log('Setting res session attribute:', k, ' Value:', v);
    _.set(res_glbl.session, k, v);
    return '';
});

Handlebars.registerHelper('getSessionAttr', (attr, def, options) => {
    const v = _.get(res_glbl.session, attr, def);
    qnabot.log('Return session attribute key, value: ', attr, v);
    return v;
});

Handlebars.registerHelper('getSlot', (slotname, def, options) => {
    const v = _.get(req_glbl.slots, slotname, def);
    qnabot.log('Return slot key, value: ', slotname, v);
    return v;
});

Handlebars.registerHelper('signS3URL', (s3url, options) => {
    const signedUrl = signS3URL(s3url, 300);
    qnabot.log('Return signed S3 URL: ', signedUrl);
    // return SafeString to prevent unwanted url escaping
    return new Handlebars.SafeString(signedUrl);
});

Handlebars.registerHelper('randomPick', function () {
    const argcount = arguments.length - 1; // ignore final 'options' argument
    qnabot.log('Select randomly from ', argcount, 'inputs: ', arguments);
    const item = arguments[Math.floor(Math.random() * argcount)];
    qnabot.log('Selected: ', item);
    return item;
});

function handleSa(hit_out, hit, context) {
    hit_out.sa = [];
    hit.sa.map((obj) => {
        try {
            const sa_value = Handlebars.compile(obj.value);
            hit_out.sa.push({ text: obj.text, value: sa_value(context), enableTranslate: obj.enableTranslate });
        } catch (e) {
            qnabot.log('ERROR: Session Attributes caused Handlebars exception. Check syntax: ', obj.text);
            throw (e);
        }
    });
    return hit_out;
}

function handleR(r, hit_out, context) {
    try {
        if (r.subTitle && r.subTitle.length > 0) {
            const subTitle_template = Handlebars.compile(r.subTitle);
            hit_out.r.subTitle = subTitle_template(context);
            if (autotranslate) {
                _.set(hit_out, 'autotranslate.r.subTitle', true);
            }
        }
        if (r.title && r.title.length > 0) {
            const title_template = Handlebars.compile(r.title);
            hit_out.r.title = title_template(context);
            if (autotranslate) {
                _.set(hit_out, 'autotranslate.r.title', true);
            }
        }
        if (r.text && r.text.length > 0) {
            const text_template = Handlebars.compile(r.text);
            hit_out.r.text = text_template(context);
        }
        if (r.imageUrl && r.imageUrl.length > 0) {
            const imageUrl_template = Handlebars.compile(r.imageUrl);
            hit_out.r.imageUrl = imageUrl_template(context);
        }
        if (r.url && r.url.length > 0) {
            const url_template = Handlebars.compile(r.url);
            hit_out.r.url = url_template(context);
        }
        hit_out = handleButtons(r, hit_out, context);
    } catch (e) {
        qnabot.log(`ERROR: response card fields format caused Handlebars exception. Check syntax: ${e}`);
        throw (e);
    }

    return hit_out;
}

function handleButtons(r, hit_out, context) {
    if (r.buttons && r.buttons.length > 0) {
        for (let x = 0; x < r.buttons.length; x++) {
            const b_text_template = Handlebars.compile(r.buttons[x].text);
            hit_out.r.buttons[x].text = b_text_template(context);
            if (r.buttons[x].text.length > 0 && autotranslate) {
                _.set(hit_out, 'autotranslate.r.buttons[x].text', true);
            }
            const b_value_template = Handlebars.compile(r.buttons[x].value);
            hit_out.r.buttons[x].value = b_value_template(context);
            if (r.buttons[x].value.length > 0 && autotranslate) {
                _.set(hit_out, 'autotranslate.r.buttons[x].value', true);
            }
        }
    }

    return hit_out;
}

function handleRp(rp, hit_out, context) {
    try {
        const rp_template = Handlebars.compile(rp);
        hit_out.rp = rp_template(context);
        if (autotranslate) {
            _.set(hit_out, 'autotranslate.rp', true);
        }
    } catch (e) {
        qnabot.log('ERROR: reprompt caused Handlebars exception. Check syntax: ', rp);
        throw (e);
    }

    return hit_out;
}

function handleSsml(ssml, hit_out, context) {
    try {
        const ssml_template = Handlebars.compile(ssml);
        hit_out.alt.ssml = ssml_template(context);
        if (autotranslate) {
            _.set(hit_out, 'autotranslate.alt.ssml', true);
        }
    } catch (e) {
        qnabot.log('ERROR: SSML caused Handlebars exception. Check syntax: ', ssml);
        throw (e);
    }

    return hit_out;
}

function handleMarkdown(markdown, hit_out, context) {
    try {
        const markdown_template = Handlebars.compile(markdown);
        hit_out.alt.markdown = markdown_template(context);
        if (autotranslate) {
            _.set(hit_out, 'autotranslate.alt.markdown', true);
        }
    } catch (e) {
        qnabot.log('ERROR: Markdown caused Handlebars exception. Check syntax: ', markdown);
        throw (e);
    }

    return hit_out;
}

function handleA(a, hit_out, context) {
    try {
        const a_template = Handlebars.compile(a);
        hit_out.a = a_template(context);
        if (autotranslate) {
            _.set(hit_out, 'autotranslate.a', true);
        }
    } catch (e) {
        qnabot.log('ERROR: Answer caused Handlebars exception. Check syntax: ', a);
        throw (e);
    }

    return hit_out;
}

const apply_handlebars = async function (req, res, hit) {
    qnabot.log('apply handlebars');
    qnabot.debug(`req is: ${JSON.stringify(req, null, 2)}`);
    qnabot.log(`res is: ${JSON.stringify(res, null, 2)}`);
    res_glbl = res; // shallow copy - allow modification by setSessionAttr helper
    req_glbl = req; // shallow copy - allow sessionAttributes retrieval by ifLang helper
    _.set(req_glbl._event, 'errorFound', false);
    const context = {
        LexOrAlexa: req._type,
        ClientType: req._clientType,
        UserInfo: req._userInfo,
        SessionAttributes: _.get(res, 'session'),
        Slots: _.get(req, 'slots'),
        Settings: req._settings,
        Question: req.question,
        OrigQuestion: _.get(req, '_event.origQuestion', req.question),
        PreviousQuestion: _.get(req, 'session.qnabotcontext.previous.q', false),
        Sentiment: req.sentiment,
    };
    // Autotranslation enabled by default.. will be disabled when handlebars finds explicit language match block.
    autotranslate = true;
    qnabot.log('Apply handlebars preprocessing to ES Response. Context: ', context);
    let hit_out = _.cloneDeep(hit);
    const a = _.get(hit, 'a');
    const markdown = _.get(hit, 'alt.markdown');
    const ssml = _.get(hit, 'alt.ssml');
    const rp = _.get(hit, 'rp', _.get(req, '_settings.DEFAULT_ALEXA_REPROMPT'));
    const r = _.get(hit, 'r');
    const kendraRedirectQueryText = _.get(hit, 'kendraRedirectQueryText');
    const kendraRedirectQueryArgs = _.get(hit, 'kendraRedirectQueryArgs');

    // catch and log errors before throwing exception.
    if (a) {
        hit_out = handleA(a, hit_out, context);
    }
    if (markdown) {
        hit_out = handleMarkdown(markdown, hit_out, context);
    }
    if (ssml) {
        hit_out = handleSsml(ssml, hit_out, context);
    }
    if (rp) {
        hit_out = handleRp(rp, hit_out, context);
    }
    if (r) {
        hit_out = handleR(r, hit_out, context);
    }
    if (_.get(hit, 'sa')) {
        hit_out = handleSa(hit_out, hit, context);
    }
    if (kendraRedirectQueryText) {
        try {
            const kendraRedirectQueryText_template = Handlebars.compile(kendraRedirectQueryText);
            hit_out.kendraRedirectQueryText = kendraRedirectQueryText_template(context);
        } catch (e) {
            qnabot.log('ERROR: Answer caused Handlebars exception. Check syntax: ', kendraRedirectQueryText);
            throw (e);
        }
    }
    if (kendraRedirectQueryArgs) {
        hit_out.kendraRedirectQueryArgs = [];
        hit.kendraRedirectQueryArgs.map((arg) => {
            try {
                const arg_template = Handlebars.compile(arg);
                hit_out.kendraRedirectQueryArgs.push(arg_template(context));
            } catch (e) {
                qnabot.log('ERROR: Answer caused Handlebars exception. Check syntax: ', arg);
                throw (e);
            }
        });
    }
    qnabot.log('Preprocessed Result: ', hit_out);
    return hit_out;
};

module.exports = async function (req, res, es_hit) {
    qnabot.log('entering apply_handlebars');
    return await apply_handlebars(req, res, es_hit);
};
