// Historical Notes factories only. Deployed endpoints return 410.
import {HttpError} from './security.js';
const retired=async()=>{throw new HttpError(410,'Kho Notes cũ đã ngừng hoạt động.');};
export const read=retired,write=retired,paths=retired,listMetadata=retired;
