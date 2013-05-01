var sock = null;

function createWebsocket() {
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
}

function addSocketHandlers() {
  if (sock) {
    console.log("have sock");
    sock.onopen = function() {
       console.log("Connected");
       if(document.location.hash.length > 0) {
         var chan = document.location.hash.substring(1);
         joinChannel(chan);
       }
    }

    sock.onclose = function(e) {
      console.log("Connection closed (wasClean = " + e.wasClean + ", code = " + e.code + ", reason = '" + e.reason + "')");
      sock = null;
    }

    sock.onmessage = function(e) {
      console.log("Got message: " + e.data);
      var msg = $.parseJSON(e.data);
      if(msg['type'] == 'msg') {
        if(window.curChannel == msg['chan']) {
          displayMsg(msg['chan'], msg['user'], msg['content']);
        }
      } else if(msg['type'] == 'nicklist') {
        if(window.curChannel == msg['chan']) {
          parseUsers(msg['nicks']);
        } else {
          add_channel_btn_if_not_exists(msg['chan']);
        }
        if(msg['nicks'].length == 0) {
          remove_channel_btn(msg['chan']);
        }
      }
    }
  }
}

function add_channel_btn_if_not_exists(channel) {
  var clean_chan = channel.replace(/#/g, "");
  if($('#' + clean_chan + '-chan-btn').length == 0) {
    var clean_chan = channel.replace(/#/g, "");
    var entry = $('<li id="' + clean_chan + '-chan-btn"><a href="#' + channel + '">' + channel + '</a></li>')
    entry.click(channelButtonHandler);
    $('#add-btn').before(entry);
  }
}

function remove_channel_btn(channel) {
  var clean_chan = channel.replace(/#/g, "");
  $('#' + clean_chan + '-chan-btn').remove();
}

$(window).load(function () {
  window.curChannel = '';

  createWebsocket();
  addSocketHandlers();

  $.get('/api/' + window.user + '/channels/', function(data) {
    var channels = $.parseJSON(data);
    $.each(channels, function(i, channel) {
      add_channel_btn_if_not_exists(channel);
    });
  });

  $('#add-btn').click(function(e) {
    var new_chan = prompt("How do you want to call your channel?", "#chan");
    add_channel_btn_if_not_exists(new_chan);
    joinChannel(new_chan);
  });
});


$(window).on('unload', function(){
  if(window.curChannel != '') {
    console.log("quitting");
    sock.send(JSON.stringify({action: 'quit', user: window.user, chan: window.curChannel }));
  }
});


function channelButtonHandler(e) {
  joinChannel(e.target.text);
}

function joinChannel(chan) {
  if(window.curChannel != '') {
    sock.send(JSON.stringify({action: 'quit', user: window.user, chan: window.curChannel }));
  }

  console.log("joining ", chan);
  window.curChannel = chan;

  $('.channels > li').removeClass('active');
  var clean_chan = chan.replace(/#/g, "");
  add_channel_btn_if_not_exists(chan);
  $('#' + clean_chan + '-chan-btn').addClass('active');

  sock.send(JSON.stringify({action: 'join', user: window.user, chan: window.curChannel }));

  $('.entry_bar').html('\
<div class="textarea-container">\
  <textarea id="msg-box" rows="2" cols="100" placeholder="Write a message..." ></textarea> \
</div>\
<button class="send-btn btn btn-primary">Send</button> \
<div class="option-div"> \
  Press Enter to send \
  <input type="checkbox" id="enter-to-end" checked> \
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

  $('#enter-to-end').click(toggleEnterToSend);
  $('.send-btn').click(sendMsg);

  $(".send-btn").hide();
  $("#msg-box").unbind("keypress");
  $("#msg-box").keypress(sendOnEnter);
}

function parseUsers(data) {
  $('#contact-list').html('');
  $.each(data, function(i, user) {
    var contact_entry = $('<li>' + user + '</li>')
    $('#contact-list').append(contact_entry);
  });
}

function toggleEnterToSend (e) {
  console.log(e);
  if(e.target.checked) {
    // use enter to send - hide button
    console.log("hide");
    $(".send-btn").hide();
    $("#msg-box").unbind("keypress");
    $("#msg-box").keypress(sendOnEnter);
  } else {
    console.log("show");
    $(".send-btn").show();
    $("#msg-box").unbind("keypress");
  }
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

function displayMsg(chan, user, content) {
  console.log("displaying", chan, user, content);
  if(chan == window.curChannel) {
    var time = new Date().toTimeString().substring(0, 8);
    var msg_entry = $('<tr>\
    <td class="time">[' + time + ']</td>\
    <td class="user">' + user + '</td>\
    <td class="msg">' + content + '</td>\
  </tr>');

    $('.messages').append(msg_entry);
    $('.msg-container').scrollTop($(document).height());
  }
}
