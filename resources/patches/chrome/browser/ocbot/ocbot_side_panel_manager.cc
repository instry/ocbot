// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/ocbot/ocbot_side_panel_manager.h"

#include "base/functional/bind.h"
#include "base/task/sequenced_task_runner.h"
#include "base/time/time.h"
#include "chrome/browser/ocbot/ocbot_constants.h"
#include "chrome/browser/ui/browser_window/public/browser_window_features.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/views/side_panel/side_panel_entry.h"
#include "chrome/browser/ui/views/side_panel/side_panel_entry_key.h"
#include "chrome/browser/ui/views/side_panel/side_panel_ui.h"

namespace ocbot {

namespace {

// Track if we've already auto-opened in this session
bool g_did_auto_open = false;

// Delay before auto-opening to ensure browser UI is stable
constexpr base::TimeDelta kAutoOpenDelay = base::Seconds(2);

}  // namespace

void ToggleSidePanel(BrowserWindowInterface* browser_window) {
  if (!browser_window) {
    return;
  }

  auto* side_panel_ui = browser_window->GetFeatures().side_panel_ui();
  if (!side_panel_ui) {
    return;
  }

  SidePanelEntry::Key ocbot_key(SidePanelEntry::Id::kExtension,
                                 kOcbotExtensionId);
  side_panel_ui->Toggle(ocbot_key, SidePanelOpenTrigger::kToolbarButton);
}

void OpenSidePanel(BrowserWindowInterface* browser_window) {
  if (!browser_window) {
    return;
  }

  auto* side_panel_ui = browser_window->GetFeatures().side_panel_ui();
  if (!side_panel_ui) {
    return;
  }

  SidePanelEntry::Key ocbot_key(SidePanelEntry::Id::kExtension,
                                 kOcbotExtensionId);
  side_panel_ui->Show(ocbot_key);
}

void MaybeAutoOpenSidePanel(BrowserWindowInterface* browser_window) {
  // Only auto-open once per session
  if (g_did_auto_open) {
    return;
  }

  if (!browser_window) {
    return;
  }

  // Mark as attempted (even if it fails)
  g_did_auto_open = true;

  // Delay the actual open to ensure the browser UI is fully stable
  base::SequencedTaskRunner::GetCurrentDefault()->PostDelayedTask(
      FROM_HERE,
      base::BindOnce(
          [](base::WeakPtr<BrowserWindowInterface> browser_window) {
            if (!browser_window) {
              return;
            }
            OpenSidePanel(browser_window.get());
          },
          browser_window->GetWeakPtr()),
      kAutoOpenDelay);
}

}  // namespace ocbot
