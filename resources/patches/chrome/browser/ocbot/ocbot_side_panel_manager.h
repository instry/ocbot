// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// ocbot Side Panel Manager
// Manages ocbot side panel visibility, auto-open on startup, and toggle behavior.

#ifndef CHROME_BROWSER_OCBOT_OCBOT_SIDE_PANEL_MANAGER_H_
#define CHROME_BROWSER_OCBOT_OCBOT_SIDE_PANEL_MANAGER_H_

#include "base/functional/callback.h"

class BrowserWindowInterface;

namespace ocbot {

// Toggle the ocbot side panel for the given browser window.
// If the panel is closed, it will be opened.
// If the panel is open, it will be closed.
void ToggleSidePanel(BrowserWindowInterface* browser_window);

// Open the ocbot side panel for the given browser window.
// Does nothing if the panel is already open.
void OpenSidePanel(BrowserWindowInterface* browser_window);

// Maybe auto-open the ocbot side panel on browser startup.
// This should be called after the browser window is fully initialized.
// The actual opening is delayed slightly to ensure UI stability.
// Only opens once per browser session (tracks via static bool).
void MaybeAutoOpenSidePanel(BrowserWindowInterface* browser_window);

}  // namespace ocbot

#endif  // CHROME_BROWSER_OCBOT_OCBOT_SIDE_PANEL_MANAGER_H_
