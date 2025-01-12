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

aws.config.region = process.env.AWS_REGION;
const s3 = new aws.S3();
const lambda = new aws.Lambda();
const _ = require('lodash');

module.exports = async function (config, body) {
    try {
        console.log(`payload for testall es proxy is: ${JSON.stringify(body)}`);
        const response = await lambda.invoke({
            FunctionName: process.env.ES_PROXY,
            Payload: JSON.stringify(body),
        }).promise();
        const result = JSON.parse(response.Payload);
        console.log(result);
        config.scroll_id = result._scroll_id;
        config.status = 'InProgress';
        console.log(`result from parsing load is: ${JSON.stringify(result, null, 2)}`);
        const documents = _.get(result, 'hits.hits', []);
        if (documents.length) {
            const body = documents.map((x) => {
                const out = x._source;
                if (out.type === 'qna') {
                    out.q = out.questions.map((y) => y.q);
                    delete out.questions;
                }
                return JSON.stringify(out);
            }).join('\n');
            const key = `${config.tmp}/${config.parts.length + 1}`;
            const upload_result = await s3.putObject({
                Body: body,
                Bucket: config.bucket,
                Key: key,
            }).promise();

            config.parts.push({
                version: upload_result.VersionId,
                key,
            });
        } else {
            config.status = 'Lex';
        }
        return config;
    } catch (error) {
        console.error('An error occured while executing loading tasks: ', error);
    }
};
function query(filter) {
    return {
        size: 1000,
        query: {
            bool: _.pickBy({
                must: { match_all: {} },
                filter: filter ? {
                    regexp: {
                        qid: filter,
                    },
                } : null,
            }),
        },
    };
}
