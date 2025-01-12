#! /usr/bin/env node
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

const config = require('../config.json');
const fs = require('fs').promises;

process.env.AWS_PROFILE = config.profile;
process.env.AWS_DEFAULT_REGION = config.profile;
const aws = require('aws-sdk');
aws.config.region = require('../config.json').region;
const { region } = require('../config.json');

const cf = new aws.CloudFormation();
const s3 = new aws.S3();
const name = require('./name');

module.exports = run;

if (require.main === module) {
    const argv = require('commander');
    let ran;
    argv.version('1.0')
        .name('npm run check')
        .arguments('<stack>')
        .description('Check syntax of cloudformation templates')
        .usage('<stack> [options]')
        .option('--file <file>', 'absolute path to template file')
        .action(async (stack, options) => {
            ran = true;
            try {
                await run(stack, options);
                console.log(`${stack} is Valid`);
            } catch (e) {
                console.log('Invalid');
                console.log(e.message);
            }
        })
        .parse(process.argv);
    if (!ran) {
        argv.outputHelp();
    }
}

async function run(stack, options = {}) {
    const name = stack || options.file.split('/')
        .reverse()
        .filter((x) => x)
        .slice(0, 2)
        .reverse()
        .join('-')
        .split('.')[0];

    if (config.skipCheckTemplate) {
        console.log('Skipping check for CFN tempalate');
        return new Promise((resolve, reject) => {
            resolve([]);
        });
    }
    const templateFile = options.file || `${__dirname}/../build/templates/${stack}.json`;
    const template = await fs.readFile(templateFile, 'utf8');
    console.log(`resources: ${Object.keys(JSON.parse(template).Resources).length}`);
    if (Buffer.byteLength(template) > 51200) {
        const exp = await bootstrap();
        const { Bucket } = exp;
        const prefix = exp.Prefix;
        const Key = `${prefix}/templates/${stack}.json`;
        const TemplateURL = `https://${Bucket}.s3.${region}.amazonaws.com/${Key}`;
        console.log(TemplateURL);
        await s3.putObject({ Bucket, Key, Body: template }).promise();
        return cf.validateTemplate({ TemplateURL }).promise();
    }
    return cf.validateTemplate({
        TemplateBody: template,
    }).promise();
}

async function bootstrap() {
    const outputs = {};
    const tmp = await cf.describeStacks({
        StackName: name('dev/bootstrap', {}),
    }).promise();

    tmp.Stacks[0].Outputs.forEach((x) => outputs[x.OutputKey] = x.OutputValue);
    return outputs;
}
