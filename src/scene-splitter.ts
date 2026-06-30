export interface Scene {
  text: string;
  duration: number; // seconds
}

export function splitCaptionToScenes(caption: string, totalDuration: number = 8): Scene[] {
  // Remove hashtags for scene splitting
  const cleanCaption = caption.replace(/#\w+/g, '').trim();
  
  // Split by sentences or phrases
  const parts = cleanCaption
    .split(/[.!?]/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  // If too long, split by commas or words
  let scenes: string[] = [];
  
  if (parts.length === 0) {
    scenes = [caption];
  } else if (parts.length <= 3) {
    scenes = parts;
  } else {
    // Take first 3 sentences
    scenes = parts.slice(0, 3);
  }

  // If still only 1 scene and it's long, split by words (max 5 words per scene)
  if (scenes.length === 1 && scenes[0].split(' ').length > 8) {
    const words = scenes[0].split(' ');
    scenes = [];
    for (let i = 0; i < words.length; i += 5) {
      scenes.push(words.slice(i, i + 5).join(' '));
    }
  }

  // Ensure at least 1 scene
  if (scenes.length === 0) {
    scenes = [caption];
  }

  // Calculate duration per scene
  const durationPerScene = totalDuration / scenes.length;

  return scenes.map(text => ({
    text,
    duration: durationPerScene
  }));
}
