from flask import Flask
from flask.ext.login import LoginManager

app = Flask(__name__)

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = "login"


user_channels = {}
channel_users = {
  '#lounge': set(["ChanServ"])
}
last_heartbeat = {}
