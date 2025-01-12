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

const aws = require('./util/aws');
const Promise = require('./util/promise');
const base = require('./base.js');

const s3 = new aws.S3();

module.exports = class S3Lambda extends base {
    constructor() {
        super('BucketNotificationConfiguration');
    }

    Create(params, reply) {
        Promise.retry(
            () => s3.putBucketNotificationConfiguration(params).promise(),
        )
            .then(() => reply(null))
            .catch(reply);
    }

    /**
     Delete has in the past removed the putBucketNotificationConfiguration by setting
     the configuration to an empty array. Change to support upgrading a stack to the new
     use of nested stacks for import and export. The deletion of the original resources
     occurred after the new configuration had been set. This caused import and export
     to fail as the creation event of job files in the S3 bucket went unnoticed. This fix
     has no impact on bucket cleanup / removal.
     */
    Delete(ID, params, reply) {
        reply(null);
    }

    Update(ID, params, oldparams, reply) {
        this.Create(params, reply);
    }
};
