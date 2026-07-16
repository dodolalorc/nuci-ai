import { describe, expect, it } from "vitest"

import { DEFAULT_SETTINGS } from "./constants"
import { redactProviderSecrets } from "./storage"

describe("redactProviderSecrets", () => {
  it("removes API keys without mutating the local settings object", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      provider: { ...DEFAULT_SETTINGS.provider, apiKey: "legacy-key" },
      providers: DEFAULT_SETTINGS.providers.map((provider) => ({
        ...provider,
        apiKey: "provider-key"
      }))
    }

    const redacted = redactProviderSecrets(settings)

    expect(redacted.provider.apiKey).toBe("")
    expect(redacted.providers[0]?.apiKey).toBe("")
    expect(settings.provider.apiKey).toBe("legacy-key")
    expect(settings.providers[0]?.apiKey).toBe("provider-key")
  })
})
