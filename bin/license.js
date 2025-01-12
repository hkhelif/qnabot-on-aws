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

const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));
const readdir = Promise.promisify(require('recursive-readdir'));

const files = readdir(`${__dirname}/../`)
    .filter((x) => !x.match(/.*node_modules.*/));

const jsfiles = files.filter((x) => x.match(/.*\.js$/)).tap((x) => console.log(`${x.length} js files`));
const vuefiles = files.filter((x) => x.match(/.*\.vue$/)).tap((x) => console.log(`${x.length} vue files`));

Promise.join(
    jsfiles.map(js),
    vuefiles.map(vue),
).tap(() => console.log('done'));

const license = fs.readFileAsync(`${__dirname}/license.txt`, 'utf8')
    .then((file) => {
        const tmp = file.split('\n');
        return tmp.slice(0, tmp.length - 1);
    });

function js(name) {
    const source = fs.readFileAsync(name, 'utf8').then((x) => x.split('\n'));
    Promise.join(source, license)
        .spread((file, license) => {
            const position = file[0].match('#!') ? 1 : 0;
            if (!source[position + 1].match('Copyright 2017-2017')) {
                return fs.writeFileAsync(name, insert(file, license, position));
            }
        });
}
function vue(name) {
    const source = fs.readFileAsync(name, 'utf8').then((x) => x.split('\n'));
    Promise.join(source, license)
        .spread((file, license) => {
            const position = file.findIndex((x) => x.match('<script>')) + 1;
            if (!source[position + 1].match('Copyright 2017-2017')) {
                return fs.writeFileAsync(name, insert(file, license, position));
            }
        });
}
function insert(file, license, position) {
    if (file[position].match('/*license')) {
        file = file.join('\n').replace(/\/\*license[\s\S]*\*\/[\n\r]/, '').split('\n');
    }
    return file.slice(0, position)
        .concat(license)
        .concat(file.slice(position, file.length))
        .join('\n');
}
