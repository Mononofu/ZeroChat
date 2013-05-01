import zmq
import threading
from common import app


defines = {}
f = open("/home/mononofu/Programmieren/TU/SEPM-group/common/defines.h")
for line in f.read().split("\n"):
  if "define" not in line or line.startswith("//"):
    continue
  _, name, value = line.split(" ")
  if value in defines:
    defines[name] = defines[value]
  else:
    defines[name] = value.replace("\"", "")


class MessageReader(threading.Thread):
  def __init__(self, ctx, ws):
    threading.Thread.__init__(self)
    self.msg_out = ctx.socket(zmq.SUB)
    self.msg_out.connect(defines['ZMQ_SOCK_MSG_OUT_CONN'])
    self.msg_out.setsockopt(zmq.SUBSCRIBE, '')
    self.ws_handler = ws

  def run(self):
    while True:
      channel, recipient, sender, content = self.msg_out.recv_multipart()
      self.ws_handler.send_msg(channel, recipient, sender, content)


class MessageSender(object):
  def __init__(self, websocketHandler):
    self.ctx = zmq.Context()
    self.ws_handler = websocketHandler

    self.chan_action = self.ctx.socket(zmq.PUB)
    self.chan_action.connect(defines['ZMQ_SOCK_CHAN_ACTION_CONN'])

    self.msg_in = self.ctx.socket(zmq.PUB)
    self.msg_in.connect(defines['ZMQ_SOCK_MSG_IN_CONN'])

    self.reader = MessageReader(self.ctx, self.ws_handler)
    self.reader.start()

  def send_msg(self, channel, user, content):
    self.msg_in.send_unicode(channel, zmq.SNDMORE)
    self.msg_in.send_unicode(user, zmq.SNDMORE)
    self.msg_in.send_unicode(content)

  def join_channel(self, channel, user):
    self.chan_action.send_unicode(channel, zmq.SNDMORE)
    self.chan_action.send_unicode(user, zmq.SNDMORE)
    self.chan_action.send_unicode("join")
