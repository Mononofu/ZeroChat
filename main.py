from flask import redirect, request, render_template, url_for, flash
from flask.ext.login import login_required, UserMixin, current_user, login_user, logout_user
from flask.views import View
import json
from common import *
from messaging import MessageSender
import werkzeug.serving
import sqlite3
import hashlib
import uuid

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


def create_user(user, pw):
  with sqlite3.connect('users.db') as conn:
    c = conn.cursor()
    c.execute("SELECT * FROM users WHERE username = ?", (user,))
    if len(c.fetchall()) > 0:
      return False

    c.execute('''CREATE TABLE IF NOT EXISTS users
               (username text, password text, salt text)''')

    salt = uuid.uuid4().hex
    hashed_password = hashlib.sha512(pw + salt).hexdigest()
    for i in range(1000):
      hashed_password = hashlib.sha512(hashed_password + salt).hexdigest()
    c.execute("INSERT INTO users VALUES (?, ?, ?)", (user, hashed_password, salt))
    conn.commit()
    return True


def check_user(user, pw):
  try:
    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    c.execute("SELECT * FROM users WHERE username = ?", (user,))
    user, stored_hashed_pw, salt = c.fetchone()

    hashed_password = hashlib.sha512(pw + salt).hexdigest()
    for i in range(1000):
      hashed_password = hashlib.sha512(hashed_password + salt).hexdigest()
    return hashed_password == stored_hashed_pw
  except Exception as e:
    app.logger.debug(str(e))
    return False


@app.route("/login_post/", methods=['POST'])
def login_post():
  app.logger.debug(request.form)
  if len(request.form['username']) < 3:
    flash("Your username should be at least 3 characters long.")
    return redirect('/login/')
  if len(request.form['password']) < 3:
    flash("Your password should be at least 3 characters long.")
    return redirect('/login/')

  if 'signup' in request.form:
    if not create_user(request.form['username'], request.form['password']):
      flash("User already exists.")
      return redirect('/login/')

  if not check_user(request.form['username'], request.form['password']):
    flash("Invalid password or username.")
    return redirect('/login/')

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
  if user not in user_channels:
    return json.dumps(['#lounge'])

  return json.dumps(list(set(['#lounge'] + list(user_channels[user]))))


@app.route("/emoticon_list/")
@login_required
def list_emoticons():
  return render_template('emoticons.html', user=str(current_user))


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
