from flask import redirect, request, render_template, url_for
from flask.ext.login import login_required, UserMixin, current_user, login_user, logout_user
from flask.views import View
import json
from common import *
from messaging import MessageSender
import werkzeug.serving

sender = None
ws_handler = None


class User(UserMixin):
  def __init__(self, name):
    self.name = name

  def __str__(self):
    return self.name

  def get_id(self):
    return self.name


@login_manager.user_loader
def load_user(userid):
    return User(userid)


@app.route("/")
@login_required
def index():
    return render_template('chat.html', user=str(current_user))


class Login(View):
  def dispatch_request(self):
    return render_template('signin.html')

app.add_url_rule('/login/', view_func=Login.as_view('login'))


@app.route("/login_post/", methods=['POST'])
def login_post():
  user = User(request.form['username'])
  login_user(user, remember=('remember-me' in request.form))
  return redirect(request.args.get("next") or url_for("index"))


@app.route("/logout/")
@login_required
def logout():
  logout_user()
  return redirect("/")


@app.route("/chan/<chan>/")
@login_required
def view_chan(chan):
  return str(current_user)


@app.route("/api/<user>/channels/")
@login_required
def show_channels(user):
  # always return at least the lounge
  return json.dumps(list(set(['#lounge'] + list(channel_users.iterkeys()))))


from twisted.internet import reactor
from twisted.web.server import Site
from twisted.web.wsgi import WSGIResource
from autobahn.resource import WebSocketResource, \
                              WSGIRootResource, \
                              HTTPChannelHixie76Aware
from websocket import BroadcastServerFactory, EchoServerProtocol

port = 5000
ws_url = 'http://localhost:5000'
ws_url = ws_url.replace('http://', 'ws://')


@werkzeug.serving.run_with_reloader
def run_dev_server():
  global sender
  global ws_handler

  app.secret_key = "SECRET"
  app.debug = True

  ## create a Twisted Web resource for our WebSocket server
  wsFactory = BroadcastServerFactory(ws_url, debug=True, debugCodePaths=True)

  wsFactory.protocol = EchoServerProtocol
  wsFactory.setProtocolOptions(allowHixie76=True)

  wsResource = WebSocketResource(wsFactory)

  ## create a Twisted Web WSGI resource for our Flask server
  wsgiResource = WSGIResource(reactor, reactor.getThreadPool(), app)

  ## create a root resource serving everything via WSGI/Flask, but
  ## the path "/ws" served by our WebSocket stuff
  rootResource = WSGIRootResource(wsgiResource, {'ws': wsResource})

  ## create a Twisted Web Site and run everything
  site = Site(rootResource)
  site.protocol = HTTPChannelHixie76Aware

  sender = MessageSender(wsFactory)
  wsFactory.sender = sender
  ws_handler = wsFactory

  reactor.listenTCP(port, site)
  reactor.run()

if __name__ == "__main__":
  run_dev_server()
