from autobahn.websocket import WebSocketServerFactory, WebSocketServerProtocol
import json
from common import *
from twisted.internet import reactor
import cgi
import time


class EchoServerProtocol(WebSocketServerProtocol):
  def onOpen(self):
    # app.logger.debug("socket opened for %s" % self.peerstr)
    pass

  def onQuit(self, j, user):
    chan = j["chan"]
    if user in user_channels:
      del user_channels[user]
    if chan in channel_users and user in channel_users[chan]:
      channel_users[chan].remove(user)
    self.factory.sender.quit_channel(chan, user)
    self.factory.update_users(chan, channel_users[chan])
    self.factory.send_chan_event(chan, user, 'quit')

  def onJoin(self, j, user):
    chan = j["chan"]
    if user not in user_channels:
      user_channels[user] = set()
    user_channels[user].add(chan)

    if chan not in channel_users:
      channel_users[chan] = set()
    channel_users[chan].add(user)

    last_heartbeat[user] = time.time()
    self.factory.sender.join_channel(chan, user)
    self.factory.update_users(chan, channel_users[chan])
    self.factory.send_chan_event(chan, user, 'join')

  def onSend(self, j, user):
    escaped_msg = cgi.escape(j['msg'])
    if escaped_msg.startswith("/"):
      self.factory.sender.handle_command(escaped_msg)
    else:
      self.factory.sender.send_msg(j['chan'], user, escaped_msg)

  def onSocketOpen(self, j, user):
    self.user = user
    # app.logger.debug("socket opened for %s" % user)
    self.factory.register(self, user)

  def onHeartbeat(self, j, user):
    last_heartbeat[user] = time.time()

  def onMessage(self, msg, binary):
    if not binary:
      j = json.loads(msg)

      if j['action'] != 'heartbeat':
        app.logger.debug("'%s' from %s" % (msg, self.peerstr))

      handlers = {'quit': self.onQuit, 'join': self.onJoin, 'send': self.onSend,
                  'socket_open': self.onSocketOpen, 'heartbeat': self.onHeartbeat}
      handlers[j['action']](j, j['user'])

  def connectionLost(self, reason):
    WebSocketServerProtocol.connectionLost(self, reason)
    # app.logger.debug("socket lost for %s: %s" % (self.peerstr, reason))
    self.factory.unregister(self, self.user)


class BroadcastServerFactory(WebSocketServerFactory):
  """
  Simple broadcast server broadcasting any message it receives to all
  currently connected clients.
  """

  def __init__(self, url, debug=False, debugCodePaths=False):
    WebSocketServerFactory.__init__(self, url, debug=debug, debugCodePaths=debugCodePaths)
    self.clients = {}
    self.tickcount = 0
    self.tick()

  def tick(self):
    self.tickcount += 1
    for cs in self.clients.itervalues():
      for c in cs:
        c.sendMessage(json.dumps({'type': 'heartbeat', 'count': self.tickcount}))

    now = time.time()
    last_heartbeat['ChanServ'] = now
    to_kick = []
    for user, lastBeat in last_heartbeat.iteritems():
      if now - lastBeat > 10:
        to_kick.append(user)

    for user in to_kick:
      app.logger.debug("Kicking %s" % user)
      del last_heartbeat[user]
      for chan in user_channels[user]:
        self.send_chan_event(chan, user, 'quit', ' (Ping timeout)')
        self.update_users(chan, channel_users[chan])

    reactor.callLater(1, self.tick)

  def register(self, client, username):
    if not username in self.clients:
      self.clients[username] = []
    if not client in self.clients[username]:
      # app.logger.debug("registered client " + client.peerstr)
      self.clients[username].append(client)

  def unregister(self, client, username):
    if username in self.clients:
      if client in self.clients[username]:
        # app.logger.debug("unregistered client " + client.peerstr)
        self.clients[username].remove(client)
        if len(self.clients[username]) == 0:
          del self.clients[username]

  def send_msg(self, channel, recipient, sender, content):
    msg = json.dumps({'type': 'msg', 'chan': channel, 'user': sender, 'content': content})
    if recipient in self.clients:
      for c in self.clients[recipient]:
        c.sendMessage(msg)

  def update_users(self, channel, users):
    now = time.time()
    # only show online users
    users = [user for user in users if user in last_heartbeat and now - last_heartbeat[user] < 10]
    msg = json.dumps({'type': 'nicklist', 'chan': channel, 'nicks': list(users)})
    if channel in channel_users:
      for user in channel_users[channel]:
        if user in self.clients:
          for c in self.clients[user]:
            c.sendMessage(msg)

  def send_chan_event(self, channel, user, event, reason=''):
    msg = json.dumps({'type': 'chan_event', 'chan': channel, 'user': user, 'event': event, 'reason': reason})
    if channel in channel_users:
      for user in channel_users[channel]:
        if user in self.clients:
          for c in self.clients[user]:
            c.sendMessage(msg)
