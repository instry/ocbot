// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// ocbot Constants Definition
// Defines extension IDs, brand constants, and utility functions for ocbot

#ifndef CHROME_BROWSER_OCBOT_OCBOT_CONSTANTS_H_
#define CHROME_BROWSER_OCBOT_OCBOT_CONSTANTS_H_

#include <string>
#include <vector>

namespace ocbot {

// ============================================================================
// Extension IDs
// ============================================================================

// ocbot Extension ID (32 characters)
// Generated from public key
// Development ID (unpacked extension): "gidimhmdbcpoeljccjcnodepmmjpfnmf"
// Production ID (CWS published): replace with actual ID
inline constexpr char kOcbotExtensionId[] =
    "gidimhmdbcpoeljccjcnodepmmjpfnmf";

// Extension info structure
struct OcbotExtensionInfo {
  const char* id;
  bool is_pinned;     // Whether to force pin to toolbar
  bool is_labelled;   // Whether to show label on toolbar
  const char* name;   // Display name
};

// ============================================================================
// Extension List
// ============================================================================

// Currently ocbot uses a single extension for all functionality
inline constexpr OcbotExtensionInfo kOcbotExtensions[] = {
    {kOcbotExtensionId, true, false, "ocbot"},
};

// ============================================================================
// Utility Functions
// ============================================================================

// Check if extension ID belongs to ocbot
inline bool IsOcbotExtension(const std::string& extension_id) {
  return extension_id == kOcbotExtensionId;
}

// Check if extension should be force-pinned to toolbar
inline bool IsOcbotPinnedExtension(const std::string& extension_id) {
  for (const auto& ext : kOcbotExtensions) {
    if (extension_id == ext.id && ext.is_pinned) {
      return true;
    }
  }
  return false;
}

// Check if extension should show label on toolbar
inline bool IsOcbotLabelledExtension(const std::string& extension_id) {
  for (const auto& ext : kOcbotExtensions) {
    if (extension_id == ext.id && ext.is_labelled) {
      return true;
    }
  }
  return false;
}

// Get all ocbot extension IDs
inline std::vector<std::string> GetOcbotExtensionIds() {
  std::vector<std::string> ids;
  for (const auto& ext : kOcbotExtensions) {
    ids.emplace_back(ext.id);
  }
  return ids;
}

// ============================================================================
// Command IDs
// ============================================================================

// ocbot-specific command IDs (starting from 40400 to avoid conflicts with BrowserOS)
// Defined in chrome/app/chrome_command_ids.h
// IDC_TOGGLE_OCBOT_SIDEPANEL = 40400
// IDC_CYCLE_OCBOT_PROVIDER   = 40401

// ============================================================================
// Feature Flags
// ============================================================================

// Feature flag names (defined in chrome/browser/browser_features.cc)
// kOcbotSidePanel - Enables ocbot side panel (default: enabled)

// ============================================================================
// URL Routing
// ============================================================================

// chrome://ocbot/* URL scheme
// chrome://ocbot/settings -> extension settings page
// chrome://ocbot/chat -> chat interface (future)

}  // namespace ocbot

#endif  // CHROME_BROWSER_OCBOT_OCBOT_CONSTANTS_H_