// Dedicated password-only route so WAF counting excludes session checks/logout.
// Keep the durable Blob limiter until WAF enforcement is verified live.
import {createAuthHandler} from './auth.js';
export default createAuthHandler({loginOnly:true});
