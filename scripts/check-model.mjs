import 'dotenv/config';
import { checkConfiguredModel } from '../server/modelCheck.mjs';

const result = await checkConfiguredModel();
console.log(JSON.stringify(result, null, 2));
if (result.status === 'configuration_error' || result.status === 'list_unavailable') process.exitCode = 1;
