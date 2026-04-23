use std::sync::Mutex;

use tauri::ipc::Channel;

use super::events::UiMutationEvent;

#[derive(Default)]
pub struct UiSyncManager {
    subscribers: Mutex<Vec<Channel<UiMutationEvent>>>,
}

impl UiSyncManager {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn subscribe(&self, channel: Channel<UiMutationEvent>) {
        if let Ok(mut subscribers) = self.subscribers.lock() {
            subscribers.push(channel);
        }
    }

    pub fn publish(&self, event: UiMutationEvent) {
        let Ok(mut subscribers) = self.subscribers.lock() else {
            return;
        };

        subscribers.retain(|channel| channel.send(event.clone()).is_ok());
    }
}
