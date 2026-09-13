// Barrel export — AI layer public API. Agent runtime/route chỉ import từ đây.
'use strict'

module.exports = {
  // client (gọi model)
  aiChat: require('./client.js').aiChat,
  aiStream: require('./client.js').aiStream,
  aiMetrics: require('./client.js').metricsSnapshot,
  // registry (info/config)
  aiConfig: require('./registry.js').configSnapshot,
  aiActiveProvider: require('./registry.js').activeProviderId,
  // types
  AIError: require('./types.js').AIError,
}
