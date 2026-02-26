const channelGameLocks = new Map();

function acquireChannelGameLock(channelId, gameName) {
  const key = String(channelId);
  const current = channelGameLocks.get(key);
  if (current) {
    return current;
  }

  channelGameLocks.set(key, gameName);
  return null;
}

function releaseChannelGameLock(channelId) {
  channelGameLocks.delete(String(channelId));
}

module.exports = {
  acquireChannelGameLock,
  releaseChannelGameLock
};
