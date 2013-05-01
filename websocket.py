from autobahn.websocket import WebSocketServerFactory, WebSocketServerProtocol
import json
from common import *
from twisted.internet import reactor


class EchoServerProtocol(WebSocketServerProtocol):
   def onOpen(self):
      app.logger.debug("socket opened for %s" % self.peerstr)
      self.factory.register(self)

   def onMessage(self, msg, binary):
      if not binary:
        app.logger.debug("'%s' from %s" % (msg, self.peerstr))
        try:
          j = json.loads(msg)

          chan = j["chan"]
          user = j["user"]

          if j['action'] == 'quit':
            if user in user_channels:
              del user_channels[user]
            if chan in channel_users and user in channel_users[chan]:
              channel_users[chan].remove(user)
            self.factory.update_users(chan, channel_users[chan])

          elif j['action'] == 'join':
            if user in user_channels:
              old_chan = user_channels[user]
              if user in channel_users[old_chan]:
                channel_users[old_chan].remove(user)

            user_channels[user] = chan
            if chan not in channel_users:
              channel_users[chan] = []
            channel_users[chan].append(user)

            self.factory.sender.join_channel(chan, user)
            self.factory.update_users(chan, channel_users[chan])
          elif j['action'] == 'send':
            self.factory.sender.send_msg(chan, user, j['msg'])

        except Exception as e:
          app.logger.debug("socket message parsing failed: %s" % e)

   def connectionLost(self, reason):
      WebSocketServerProtocol.connectionLost(self, reason)
      app.logger.debug("socket lost for %s: %s" % (self.peerstr, reason))
      self.factory.unregister(self)


class BroadcastServerFactory(WebSocketServerFactory):
  """
  Simple broadcast server broadcasting any message it receives to all
  currently connected clients.
  """

  def __init__(self, url, debug=False, debugCodePaths=False):
    WebSocketServerFactory.__init__(self, url, debug=debug, debugCodePaths=debugCodePaths)
    self.clients = []
    self.tickcount = 0
    # self.tick()

  def tick(self):
    self.tickcount += 1
    self.broadcast("'tick %d' from server" % self.tickcount)
    reactor.callLater(1, self.tick)

  def register(self, client):
    if not client in self.clients:
      app.logger.debug("registered client " + client.peerstr)
      self.clients.append(client)

  def unregister(self, client):
    if client in self.clients:
      app.logger.debug("unregistered client " + client.peerstr)
      self.clients.remove(client)

  def send_msg(self, channel, user, content):
    msg = json.dumps({'type': 'msg', 'chan': channel, 'user': user, 'content': content})
    for c in self.clients:
      c.sendMessage(msg)

  def update_users(self, channel, users):
    msg = json.dumps({'type': 'nicklist', 'chan': channel, 'nicks': users})
    for c in self.clients:
      c.sendMessage(msg)
