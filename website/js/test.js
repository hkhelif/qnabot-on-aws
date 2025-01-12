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

window.horde = gremlins.createHorde();
window.horde.gremlin(gremlins.species.clicker())
    .gremlin(gremlins.species.formFiller())
    .gremlin(gremlins.species.typer());

window.start = function (logout = true) {
    logout = document.getElementById('logout');
    if (logout) logout.hidden = logout;
    window.horde.unleash();
};
