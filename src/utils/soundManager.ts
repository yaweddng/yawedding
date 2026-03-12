const sounds = {
  notification: new Audio('https://tsameemevents.com/wp-content/uploads/notification-sound.mp3'),
  messageDelivered: new Audio('https://tsameemevents.com/wp-content/uploads/message-delivered.mp3'),
  chatboxNotification: new Audio('https://tsameemevents.com/wp-content/uploads/chatbox-notifications.mp3'),
  callWaiting: new Audio('https://tsameemevents.com/wp-content/uploads/call-waiting.mp3'),
  calling: new Audio('https://tsameemevents.com/wp-content/uploads/calling.mp3'),
  typing: new Audio('https://tsameemevents.com/wp-content/uploads/typing.mp3'),
  declinedEndedError: new Audio('https://tsameemevents.com/wp-content/uploads/declined-ended-error.mp3'),
};

// Preload sounds
Object.values(sounds).forEach(audio => {
  audio.load();
});

export const playSound = (soundName: keyof typeof sounds, loop = false) => {
  const audio = sounds[soundName];
  if (audio) {
    audio.loop = loop;
    audio.currentTime = 0;
    audio.play().catch(e => console.error(`Error playing sound ${soundName}:`, e));
  }
};

export const stopSound = (soundName: keyof typeof sounds) => {
  const audio = sounds[soundName];
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }
};
