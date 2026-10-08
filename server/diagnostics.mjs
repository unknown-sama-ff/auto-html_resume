import { DIAGNOSTICS_VERSION, safeBuildVersion, safeModelLabel, REASONING_EFFORTS } from '../shared/errorDiagnostics.ts';

export const appVersion = safeBuildVersion(process.env.RAILWAY_GIT_COMMIT_SHA);
export { DIAGNOSTICS_VERSION };

export function requestDiagnostics(provider, messages, version = appVersion) {
  const model = safeModelLabel(provider.model, provider.apiKey);
  return {
    version,
    protocol: provider.protocol,
    endpoint: provider.protocol === 'responses' ? '/responses' : '/chat/completions',
    ...(model ? { model } : {}),
    ...(REASONING_EFFORTS.includes(provider.reasoningEffort) ? { reasoningEffort: provider.reasoningEffort } : {}),
    stream: false,
    hasImages: messages.some(message => Array.isArray(message.content) && message.content.some(part => part.type === 'image_url')),
  };
}

export function logAiFailure(context, applicationStatus, error) {
  // Deliberately do not log error.message, headers, request bodies, Key or upstream raw text.
  console.warn('[ai-error] ' + JSON.stringify({
    event: 'ai_failure', requestId: context.requestId, applicationStatus,
    upstreamStatus: error.upstreamStatus,
    diagnostic: error.diagnostic ?? (error.upstreamStatus === 401 ? 'authentication' : error.upstreamStatus === 403 ? 'access_denied' : 'application_error'),
    upstreamCode: error.upstreamCode, upstreamParam: error.upstreamParam,
    ...context.details,
  }));
}
