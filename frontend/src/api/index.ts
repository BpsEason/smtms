export {
  ApiError,
  readToken,
  saveToken,
  clearToken,
  buildQueryString,
  request,
  requestBlob,
} from "./client";

import * as auth from "./auth";
import * as suppliers from "./suppliers";
import * as materials from "./materials";
import * as receipts from "./receipts";
import * as supplierLots from "./supplier-lots";
import * as internalLots from "./internal-lots";
import * as iqc from "./iqc";
import * as nonconformances from "./nonconformances";
import * as traceability from "./traceability";
import * as auditLogs from "./audit-logs";
import * as roles from "./roles";
import * as users from "./users";

export const api = {
  ...auth,
  ...suppliers,
  ...materials,
  ...receipts,
  ...supplierLots,
  ...internalLots,
  ...iqc,
  ...nonconformances,
  ...traceability,
  ...auditLogs,
  ...roles,
  ...users,
};
