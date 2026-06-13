import { defineEventHandler } from "h3";

import { supabaseRuntimeDiagnostic } from "../../utils/rocket-api";

export default defineEventHandler(() => supabaseRuntimeDiagnostic());
