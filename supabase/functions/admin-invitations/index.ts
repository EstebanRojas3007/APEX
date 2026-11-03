import {invitationConfig} from '../_shared/config.ts';
import {supabaseInvitationPorts} from '../_shared/supabase.ts';
import {invitationHandler} from '../_shared/handler.ts';

// Fail closed before serving if deployment configuration is incomplete/invalid.
// Never log config, requests, provider responses or invitation links.
const config=invitationConfig(key=>Deno.env.get(key));
Deno.serve(invitationHandler(supabaseInvitationPorts(config),config.origins));
