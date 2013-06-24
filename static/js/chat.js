var sock = null
var snd = new Audio('/static/msg.wav');
snd.volume = 0.5;
var focused = true;
var tick_count = 0;


(function() {
    var hidden = "hidden";

    // Standards:
    if (hidden in document)
        document.addEventListener("visibilitychange", onchange);
    else if ((hidden = "mozHidden") in document)
        document.addEventListener("mozvisibilitychange", onchange);
    else if ((hidden = "webkitHidden") in document)
        document.addEventListener("webkitvisibilitychange", onchange);
    else if ((hidden = "msHidden") in document)
        document.addEventListener("msvisibilitychange", onchange);
    // IE 9 and lower:
    else if ('onfocusin' in document)
        document.onfocusin = document.onfocusout = onchange;
    // All others:
    else
        window.onpageshow = window.onpagehide
            = window.onfocus = window.onblur = onchange;

    function onchange (evt) {
      if('webkitVisibilityState' in document) {
        focused = document.webkitVisibilityState == "visible";
      } else if('visibilityState' in document) {
        focused = document.visibilityState == "visible";
      }

      console.log("visible: ", focused);

      if(focused) {
        if(window.blinkInterval) {
          clearInterval(window.blinkInterval);
          document.title = window.curChannel + " - ZeroChat";
        }
        window.blinkInterval = false;
      }

    }
})();

String.prototype.replaceAll = function(search, replace) {
    if (replace === undefined) {
        return this.toString();
    }
    return this.split(search).join(replace);
}

function createWebsocket() {
  console.log("try connecting");
  var wsuri;
  if (window.location.protocol === "file:") {
     wsuri = "ws://127.0.0.1:5000/ws";
  } else {
     wsuri = "ws://" + window.location.hostname + ":" + window.location.port + "/ws";
  }

  if ("WebSocket" in window) {
     sock = new WebSocket(wsuri);
  } else if ("MozWebSocket" in window) {
     sock = new MozWebSocket(wsuri);
  } else {
     console.log("Browser does not support WebSocket!");
     window.location = "http://autobahn.ws/unsupportedbrowser";
  }
  if(sock) {
    addSocketHandlers();
  }
}

function addSocketHandlers() {
  if (sock) {
    console.log("have sock");
    sock.onopen = function() {
      if(window.connectionCheckInterval)
        clearInterval(window.connectionCheckInterval);
      window.connectionCheckInterval = false;

      sock.send(JSON.stringify({action: 'socket_open', user: window.user}));
      console.log("Connected");
      if(document.location.hash.length > 0) {
        var chan = document.location.hash.substring(1);
        joinChannel(chan);
      }
      window.heartbeatInterval = setInterval("sendHeartbeat()", 1000);
    }

    sock.onclose = function(e) {
      console.log("Connection closed (wasClean = " + e.wasClean + ", code = " + e.code + ", reason = '" + e.reason + "')");
      sock = null;
      window.connectionCheckInterval = setInterval("createWebsocket()", 1000);

      if(window.heartbeatInterval)
        clearInterval(window.heartbeatInterval);
      window.heartbeatInterval = false;
    }

    sock.onmessage = function(e) {
      if(e.data.indexOf("heartbeat") == -1)
        console.log("Got message: " + e.data);

      var msg = $.parseJSON(e.data);
      if(msg['type'] == 'msg') {
        displayMsg(msg['chan'], msg['user'], msg['content']);
      } else if(msg['type'] == 'nicklist') {
        window.channelUsers[msg['chan']] = msg['nicks'];
        if(window.curChannel == msg['chan']) {
          parseUsers(msg['nicks']);
        } else {
          add_channel_btn_if_not_exists(msg['chan']);
        }
        if(msg['nicks'].length == 0) {
          remove_channel_btn(msg['chan']);
        }
      } else if(msg['type'] == 'chan_event') {
        if(msg['event'] == 'join') {
          if(channelUsers[msg['chan']].indexOf(msg['user']) < 0) {
            channelUsers[msg['chan']].push(msg['user']);
            parseUsers(window.channelUsers[chan]);
          }
          displayMsg(msg['chan'], '<span class="join">*</span>',
            '<span class="join"><b>' + msg['user'] + '</b> has joined ' + msg['chan'] + '</span>');
        } else if(msg['event'] == 'quit') {
          if(channelUsers[msg['chan']].indexOf(msg['user']) >= 0) {
            channelUsers[msg['chan']].splice(channelUsers[msg['chan']].indexOf(msg['user']), 1);
            parseUsers(window.channelUsers[chan]);
          }
          if(msg['user'] == msg['reason']) {
            displayMsg(msg['chan'], '<span class="quit">*</span>',
            '<span class="quit"><b>' + msg['user'] + '</b> has quit</span>');
          } else {
            displayMsg(msg['chan'], '<span class="quit">*</span>',
            '<span class="quit"><b>' + msg['user'] + '</b> has quit ' + msg['reason'] + '</span>');
          }

        } else if(msg['event'] == 'invite') {
          add_channel_btn_if_not_exists(msg['chan']);
        }
      }
    }
  }
}

function sendHeartbeat() {
  sock.send(JSON.stringify({action: 'heartbeat', user: window.user, count: tick_count}));
  tick_count += 1;
}

function sanitize_channel(channel) {
  return channel.replace(/#/g, "-hash-").replace(/@/g, "-at-").replace(/\./g, "-dot-");
}

function add_channel_btn_if_not_exists(channel) {
  var clean_chan = sanitize_channel(channel);
  if($('#' + clean_chan + '-chan-btn').length == 0) {

    var chanServer = channel.split("@");
    var chan = chanServer[0];
    var server = chanServer[1];

    var entry = $('<li id="' + clean_chan + '-chan-btn" title="' + server
      + '" class="user-tooltip"><a href="/#' + channel + '">' + chan + '</a></li>');
    entry.click(channelButtonHandler);
    $('#add-btn').before(entry);

    $('.user-tooltip').each(function(i, e){
      $(e).tooltip({title: "test", placement: 'bottom'});
    });
  }
}

function remove_channel_btn(channel) {
  var clean_chan = sanitize_channel(channel);
  $('#' + clean_chan + '-chan-btn').remove();
}

$(window).load(function () {
  window.curChannel = '';
  window.activeChannels = [];
  window.channelUsers = {};
  window.msgList = {};

  createWebsocket();

  $.get('/api/' + window.user + '/channels/', function(data) {
    var channels = $.parseJSON(data);
    $.each(channels, function(i, channel) {
      add_channel_btn_if_not_exists(channel);
    });
  });

  $('#add-btn').click(function(e) {
    var new_chan = prompt("How do you want to call your channel?", "#chan");
    if(new_chan.indexOf("@") == -1)
      new_chan += "@wien.furidamu.org";
    add_channel_btn_if_not_exists(new_chan);
    joinChannel(new_chan);
  });

  $.getJSON("/static/img/replacement.json", function(json) {
    window.emoticons = json;
  });
});


function channelButtonHandler(e) {
  var id = e.target.parentNode.id;
  id = id.replaceAll("-hash-", "#").replaceAll("-dot-", ".").replaceAll("-at-", "@");
  joinChannel(id.split("-chan-btn")[0]);
}

function joinChannel(chan) {
  console.log("joining", chan);
  if(window.activeChannels.indexOf(chan) == -1) {
    // joining new channel
    sock.send(JSON.stringify({action: 'join', user: window.user, chan: chan }));
    window.activeChannels.push(chan);
  }
  window.curChannel = chan;

  document.title = chan + " - ZeroChat";

  $('.channels > li').removeClass('active');
  var clean_chan = sanitize_channel(chan);
  add_channel_btn_if_not_exists(chan);
  $('#' + clean_chan + '-chan-btn').addClass('active');


  $('.entry_bar').html('\
<div class="textarea-container">\
  <textarea id="msg-box" rows="2" cols="100" placeholder="Write a message..." ></textarea> \
</div>\
<button class="invite-btn btn btn-primary">Invite User</button> \
<div class="option-div"> \
  <span>Press Enter to send</span> <br />\
  <a href="/emoticon_list/" id="emoticon-help">Emoticons & Rage Faces</a> \
</div>');

  $("#main-content").html('\
<div class="contacts">\
  <ul id="contact-list">\
  </ul>\
</div>\
\
<div class="msg-container">\
  <table class="messages">\
  </table>\
</div>\
\
<div class="user-seperator">\
</div>');

  $('.invite-btn').click(inviteUser);

  $("#msg-box").unbind("keypress");
  $("#msg-box").keypress(sendOnEnter);
  $("#msg-box").focus();

  $('#' + clean_chan + '-chan-btn a').removeClass('unread');

  var emoticons_to_show = [":)", ":(", ":D", "(Y)", "(N)", "[notbad]", "[trollol]", "[pft]"]
  var popover_content = '<table class="table">'
  $.each(emoticons_to_show, function(i, emoticon) {
    popover_content += "<tr><td>" + emoticon + "</td><td>" + addEmoticons(emoticon) + "</td></tr>";
  })
  popover_content += "</table";
  $("#emoticon-help").popover({html: true, placement: 'top', trigger: 'hover',
    title: 'Click for all Codes', content: popover_content
  });

  // display stored information for channel
  if(window.msgList[chan]) {
    $.each(window.msgList[chan], function(i, msg) {
      displayMsg(chan, msg['user'], msg['content'], msg['time'], true);
    });
  }

  if(window.channelUsers[chan]) {
    parseUsers(window.channelUsers[chan]);
  }

}

function parseUsers(data) {
  $('#contact-list').html('');
  $.each(data, function(i, user) {
    var userServer = user.split("@");
    var user = userServer[0];
    var server = userServer[1];

    var contact_entry = $('<li title="' + server + '" class="user-tooltip">' + user + '</li>')
    $('#contact-list').append(contact_entry);
  });

  $('.user-tooltip').each(function(i, e){
    $(e).tooltip({title: "test", placement: 'left'});
  });
}

function inviteUser(e) {
  var user = window.prompt("Whom do you want to invite to this chat?",
    "sepp@sepm.furidamu.org");

  if(user == null)
    return;

  sock.send(JSON.stringify({action: 'send', user: window.user,
    chan: window.curChannel, msg: '/invite ' + user + ' ' + window.curChannel }));
}

function sendOnEnter(e) {
  if(e.which == 13 && !e.shiftKey) {
    console.log(e);
    sendMsg();
    return false;
  }
}

function sendMsg () {
  console.log("Send!");
  var msg = $("#msg-box").val();
  $("#msg-box").val("");

  sock.send(JSON.stringify({action: 'send', user: window.user,
    chan: window.curChannel, msg: msg }));
}

function addEmoticons(text) {
  // put in emoticons
  if(window.emoticons) {
    for(var shortcut in window.emoticons) {
      text = text.replaceAll(shortcut, '<img title="' + shortcut + '" class="emoticon" src="' + window.emoticons[shortcut]['path'] + '">')
    }
  }
  return text;
}

function displayMsg(chan, user, content, time, replay) {
  if(typeof(time)==='undefined') time = new Date().toTimeString().substring(0, 8);;
  if(typeof(replay)==='undefined') replay = false;

  console.log("displaying", chan, user, content);

  if(!replay) {
    if(!window.msgList[chan]) {
      window.msgList[chan] = []
    }
    window.msgList[chan].push({user: user, content: content, time: time})
  }

  if(!focused && !window.blinkInterval && document.location.pathname == "/") {
    window.blinkInterval = setInterval("blinkTab()", 1000);
  }

  if(!focused && (snd.currentTime == 0 || snd.currentTime == snd.duration)  && document.location.pathname == "/") {
    // don't play more than one sound at once
    console.log("sound");
    snd.currentTime = 0;
    snd.play();
  }

  if(chan == window.curChannel) {
    content = addEmoticons(content);

    // highlight urls
    content = content.replace(/https?:\/\/([0-9a-zA-Z-]+)(\.[a-zA-Z0-9]+)*[\w\d:%#\/&\?\.]*/g, "<a href='$&'>$&</a>")


    var userServer = user.split("@");
    var user = userServer[0];
    var server = userServer[1];

    if(!server)
      server = "system message";

    var msg_entry = $('<tr>\
    <td class="time">[' + time + ']</td>\
    <td class="user user-tooltip" title="' + server + '" >' + user + '</td>\
    <td class="msg">' + content + '</td>\
  </tr>');


    $('.messages').append(msg_entry);

    $('.emoticon').each(function(i, e){
      $(e).tooltip({title: "test", placement: 'left'});
    });

    $('.user-tooltip').each(function(i, e){
      $(e).tooltip({title: "test", placement: 'right'});
    });

    $('.msg-container').scrollTop($('.messages').height());
  } else {
    var clean_chan = sanitize_channel(chan);
    $('#' + clean_chan + '-chan-btn a').addClass('unread');
  }
}


function blinkTab() {
  if(window.blinkOn) {
    document.title = window.curChannel + " - ZeroChat";
    window.blinkOn = false;
  } else {
    document.title = "New Message! - " + window.curChannel + " - ZeroChat";
    window.blinkOn = true;
  }
}
