

App = {
    unsynced: [] // unsynced surveys
};

App.init = function(survey) {
    var self = this;
    self.survey = new Survey(survey.survey_id, survey.questions);
    
    $('.nav__sync')
        .click(function() {
            App.sync();
        });
        
        
    // Syncing intervals
    setInterval(function() {
        if (navigator.onLine && self.unsynced.length) {
            _.each(self.unsynced, function(survey) {
                survey.submit();
            });
            self.unsynced = [];
        }
    }, 10000);
    
    // AppCache updates
    window.applicationCache.addEventListener('updateready', function() {
        alert('app updated, reloading...');
        window.location.reload();
    });
};

App.message = function(text) {
    // Shows a message to user
    // E.g. "Your survey has been submitted"
    $('.message')
        .clearQueue()
        .text(text)
        .fadeIn('fast')
        .delay(3000)
        .fadeOut('fast');
};

function Survey(id, questions) {
    var self = this;
    this.id = id;
    this.questions = questions;
    
    // Load answers from localStorage
    var answers = JSON.parse(localStorage[this.id] || '{}');
    _.each(this.questions, function(question) {
        question.answer = answers[question.question_id] || null;
    });
    
    // Page navigation
    $('.page_nav__prev, .page_nav__next').click(function() {
        var offset = this.classList.contains('page_nav__prev') ? -1 : 1;
        var index = $('.content').data('index') + offset;
        if (index >= 0 && index <= self.questions.length) {
            self.render(index);
        }
        return false;
    });
    
    // Render first question
    this.render(0);
};

Survey.prototype.render = function(index) {
    var self = this;
    var question = this.questions[index];
    var content = $('.content');
    
    if (question) {
        // Show widget
        var templateHTML = $('#widget_' + question.type_constraint_name).html();
        var template = _.template(templateHTML);
        var html = template({question: question});
        
        // Render question
        content.empty()
            .data('index', index)
            .html(html);
        
        // Attach widget events
        Widgets[question.type_constraint_name](question, content);
    } else {
        // Show submit page
        content.empty()
            .data('index', index)
            .html($('#template_submit').html())
            .find('.question__btn')
                .one('click', function() {
                    self.submit();
                });
    }
    
    // Update nav
    $('.page_nav__progress')
        .text((index + 1) + ' / ' + (this.questions.length + 1));
};

function getCookie(name) {
    var r = document.cookie.match("\\b" + name + "=([^;]*)\\b");
    return r ? r[1] : undefined;
}

(function () {
    var user = getCookie("user")
    var currentUser = user ? user : null;

    navigator.id.watch({
      loggedInUser: currentUser,
      onlogin: function(assertion) {
        $.ajax({
          type: 'GET',
          url: '/csrf-token',
          success: function (res, status, xhr) {
            var response = JSON.parse(res);
            var logged_in = response.logged_in;
            var fresh_token = response.token;
            if (!logged_in){
              $.ajax({
                type: 'POST',
                url: '/login/persona',
                data: {assertion:assertion},
                headers: {
                  "X-XSRFToken": fresh_token
                },
                success: function(res, status, xhr){
                  location.href = decodeURIComponent(window.location.search.substring(6));
                },
                error: function(xhr, status, err) {
                  navigator.id.logout();
                  alert("Login failure: " + err);
                }
              });
            }
          }
        });
      },
      onlogout: function() {
        // A user has logged out! Here you need to:
        // Tear down the user's session by redirecting the user or making a call to your backend.
        // Also, make sure loggedInUser will get set to null on the next page load.
        // (That's a literal JavaScript null. Not false, 0, or undefined. null.)
        $.ajax({
          type: 'POST',
          url: '/logout', // This is a URL on your website.
          headers: {
            "X-XSRFToken": getCookie("_xsrf")
          },
          success: function(res, status, xhr) {
              window.location.reload();
          },
          error: function(xhr, status, err) { alert("Logout failure: " + err); },
        });
      }

    });

    var signinLink = document.getElementById('login');
    if (signinLink) {
      signinLink.onclick = function() { navigator.id.request(); };
    }

    var signoutLink = document.getElementById('logout');
    if (signoutLink) {
      signoutLink.onclick = function() { navigator.id.logout(); };
    }
})();

Survey.prototype.submit = function() {
    var self = this;
    var sync = $('.nav__sync')[0];
    var save_btn = $('.question__saving')[0];
    var answers = {};
    
    // Save answers locally
    _.each(self.questions, function(question) {
        answers[question.question_id] = question.answer;
    });
    localStorage[self.id] = JSON.stringify(answers);

    // Prepare POST request
    var data = {
        survey_id: self.id,
        answers: self.questions
    };
    
    sync.classList.add('icon--spin');
    save_btn.classList.add('icon--spin');

    $.ajax({
        url: '',
        type: 'POST',
        contentType: 'application/json',
        processData: false,
        data: JSON.stringify(data),
        headers: {
            "X-XSRFToken": getCookie("_xsrf")
        },
        dataType: 'json',
        success: function() {
            App.message('Survey submitted!');
        },
        fail: function() {
            App.message('Submission failed, will try again later.');
            App.unsynced.push(self);
        },
        done: function() {
            setTimeout(function() {
                sync.classList.remove('icon--spin');
                save_btn.classList.remove('icon--spin');
                App.message('Survey submitted!');
                self.render(0);
            }, 1000);
        }
    });
};


var Widgets = {};
Widgets.text = function(question, page) {
    // This widget's events. Called after page template rendering.
    // Responsible for setting the question object's answer
    //
    // question: question data
    // page: the widget container DOM element
    $(page)
        .find('input')
        .on('keyup', function() {
            question.answer = this.value;
        });
};

Widgets.integer = function(question, page) {
    $(page)
        .find('input')
        .keyup(function() {
            question.answer = parseInt(this.value);
        });
};

Widgets.location = function(question, page) {
    // TODO: add location status
        
    $(page)
        .find('.question__btn')
        .click(function() {
            navigator.geolocation.getCurrentPosition(
                function success(position) {
                    // Server accepts [lon, lat]
                    var coords = [position.coords.longitude, position.coords.latitude];
                    question.answer = coords;
                    $(page).find('.question__lat').val(coords[1]);
                    $(page).find('.question__lon').val(coords[0]);
                }, function error() {
                    alert('error')
                }, {
                    enableHighAccuracy: true,
                    timeout: 20000,
                    maximumAge: 0
                });
        });
};



    
