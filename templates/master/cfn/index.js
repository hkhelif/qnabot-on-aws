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

const fs = require('fs');
const path = require('path');

const resplib = path.join(__dirname, '..', '..', 'lib', 'response.js');
const util = require('../../util');

console.log(resplib);
module.exports = {
    VersionLambda: {
        Type: 'AWS::Lambda::Function',
        Properties: {
            Code: {
                // join files by new line to ensure valid javascript
                ZipFile: `${fs.readFileSync(`${__dirname}/handler.js`, 'utf-8')}\n${fs.readFileSync(resplib, 'utf-8')}`,
            },
            Handler: 'index.handler',
            MemorySize: '3008',
            Role: { 'Fn::GetAtt': ['CFNLambdaRole', 'Arn'] },
            Runtime: process.env.npm_package_config_lambdaRuntime,
            Timeout: 60,
            VpcConfig: {
                'Fn::If': ['VPCEnabled', {
                    SubnetIds: { Ref: 'VPCSubnetIdList' },
                    SecurityGroupIds: { Ref: 'VPCSecurityGroupIdList' },
                }, { Ref: 'AWS::NoValue' }],
            },
            TracingConfig: {
                'Fn::If': ['XRAYEnabled', { Mode: 'Active' },
                    { Ref: 'AWS::NoValue' }],
            },
            Tags: [{
                Key: 'Type',
                Value: 'CustomResource',
            }],
        },
        Metadata: util.cfnNag(['W92']),
    },
    CFNVersion: {
        Type: 'Custom::S3Version',
        Properties: {
            ServiceToken: { 'Fn::GetAtt': ['VersionLambda', 'Arn'] },
            Bucket: { Ref: 'BootstrapBucket' },
            Key: { 'Fn::Sub': '${BootstrapPrefix}/lambda/cfn.zip' },
            BuildDate: (new Date()).toISOString(),
        },
    },
    CFNLambda: {
        Type: 'AWS::Lambda::Function',
        Properties: {
            Code: {
                S3Bucket: { Ref: 'BootstrapBucket' },
                S3Key: {
                    'Fn::Join': ['', [
                        { Ref: 'BootstrapPrefix' },
                        '/lambda/cfn.zip',
                    ]],
                },
                S3ObjectVersion: { 'Fn::GetAtt': ['CFNVersion', 'version'] },
            },
            Handler: 'index.handler',
            MemorySize: '3008',
            Role: { 'Fn::GetAtt': ['CFNLambdaRole', 'Arn'] },
            Runtime: process.env.npm_package_config_lambdaRuntime,
            Timeout: 180,
            VpcConfig: {
                'Fn::If': ['VPCEnabled', {
                    SubnetIds: { Ref: 'VPCSubnetIdList' },
                    SecurityGroupIds: { Ref: 'VPCSecurityGroupIdList' },
                }, { Ref: 'AWS::NoValue' }],
            },
            TracingConfig: {
                'Fn::If': ['XRAYEnabled', { Mode: 'Active' },
                    { Ref: 'AWS::NoValue' }],
            },
            Tags: [{
                Key: 'Type',
                Value: 'CustomResource',
            }],
        },
        Metadata: util.cfnNag(['W92']),
    },
    CFNInvokePolicy: {
        Type: 'AWS::IAM::ManagedPolicy',
        Properties: {
            PolicyDocument: {
                Version: '2012-10-17',
                Statement: [{
                    Effect: 'Allow',
                    Action: [
                        'lambda:InvokeFunction',
                    ],
                    Resource: [
                        { 'Fn::GetAtt': ['CFNLambda', 'Arn'] },
                    ],
                }],
            },
            Roles: [{ Ref: 'CFNLambdaRole' }],
        },
    },
};
