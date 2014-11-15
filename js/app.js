/*global jQuery, Handlebars */

jQuery(function ($) {
	'use strict';

	Handlebars.registerHelper('eq', function(a, b, options) {
		return a === b ? options.fn(this) : options.inverse(this);
	});

	var ENTER_KEY = 13;
	var ESCAPE_KEY = 27;

	var util = {
		uuid: function () {
			/*jshint bitwise:false */
			var i, random;
			var uuid = '';

			for (i = 0; i < 32; i++) {
				random = Math.random() * 16 | 0;
				if (i === 8 || i === 12 || i === 16 || i === 20) {
					uuid += '-';
				}
				uuid += (i === 12 ? 4 : (i === 16 ? (random & 3 | 8) : random)).toString(16);
			}

			return uuid;
		},
		pluralize: function (count, word) {
			return count === 1 ? word : word + 's';
		},
		store: function (namespace, data) {
			if (arguments.length > 1) {
				return localStorage.setItem(namespace, JSON.stringify(data));
			} else {
				var store = localStorage.getItem(namespace);
				return (store && JSON.parse(store)) || [];
			}
		}
	};

	var g;

	var App = {
		init: function () {
			g = new JustGage({
				id: "gauge",
				levelColors: [ "#FF0000", "#F9C802", "#A9D70B" ],
				value: 0,
				min: 0,
				max: 10,
				title: "Your Average Carbon Score"
			});

			this.todos = util.store('todos-jquery');
			this.cacheElements();
			this.bindEvents();

			new Router({
				'/:filter': function (filter) {
					this.filter = filter;
					this.render();
				}.bind(this)
			}).init('/all');

			$('#new-todo').autocomplete({
				lookup: foodList
			});
		},
		cacheElements: function () {
			this.todoTemplate = Handlebars.compile($('#todo-template').html());
			this.footerTemplate = Handlebars.compile($('#footer-template').html());
			this.$todoApp = $('#todoapp');
			this.$header = this.$todoApp.find('#header');
			this.$main = this.$todoApp.find('#main');
			this.$footer = this.$todoApp.find('#footer');
			this.$newTodo = this.$header.find('#new-todo');
			this.$toggleAll = this.$main.find('#toggle-all');
			this.$todoList = this.$main.find('#todo-list');
			this.$count = this.$footer.find('#todo-count');
			this.$clearBtn = this.$footer.find('#clear-completed');
		},
		bindEvents: function () {
			var list = this.$todoList;
			this.$newTodo.on('keyup', this.create.bind(this));
			this.$toggleAll.on('change', this.toggleAll.bind(this));
			this.$footer.on('click', '#clear-completed', this.destroyCompleted.bind(this));
			list.on('change', '.toggle', this.toggle.bind(this));
			list.on('dblclick', 'label', this.edit.bind(this));
			list.on('keyup', '.edit', this.editKeyup.bind(this));
			list.on('focusout', '.edit', this.update.bind(this));
			list.on('click', '.destroy', this.destroy.bind(this));
			list.on('mouseover', '.item', this.mouseOver);
		},
		mouseOver: function (e) {
			var $food = $(this),
					foodName = $food.text(),
					suggestions = App.suggestFood(foodName);

			var content = $('<table>');

			if(!suggestions.length) return;

			_.each(suggestions, function(food){
				var $tr = $('<tr>'),
						$a = $('<a href="#" onclick="recoClick(this)">').addClass('reco-item').html(food.value);

				$tr.append($('<td>').append($a));
				$tr.append($('<td class="greenClass squarePopover">').text(food.scoreDiff));

				content.append($tr);
      });

			$food.webuiPopover('destroy').webuiPopover({
				content: content,
				placement: 'right',
				title: 'Recommendations for ' + foodName,
				trigger: 'hover'
			}).webuiPopover('show');
		},
		render: function () {
			var todos = this.getFilteredTodos();
			this.$todoList.html(this.todoTemplate(todos));
			this.$main.toggle(todos.length > 0);
			this.$toggleAll.prop('checked', this.getActiveTodos().length === 0);
			this.renderFooter();
			this.updateScore();
			this.$newTodo.focus();
			util.store('todos-jquery', this.todos);
		},
		renderFooter: function () {
			var todoCount = this.todos.length;
			var activeTodoCount = this.getActiveTodos().length;
			var template = this.footerTemplate({
				activeTodoCount: activeTodoCount,
				activeTodoWord: util.pluralize(activeTodoCount, 'item'),
				completedTodos: todoCount - activeTodoCount,
				filter: this.filter
			});

			this.$footer.toggle(todoCount > 0).html(template);
		},
		toggleAll: function (e) {
			var isChecked = $(e.target).prop('checked');

			this.todos.forEach(function (todo) {
				todo.completed = isChecked;
			});

			this.render();
		},
		getActiveTodos: function () {
			return this.todos.filter(function (todo) {
				return !todo.completed;
			});
		},
		getCompletedTodos: function () {
			return this.todos.filter(function (todo) {
				return todo.completed;
			});
		},
		getFilteredTodos: function () {
			if (this.filter === 'active') {
				return this.getActiveTodos();
			}

			if (this.filter === 'completed') {
				return this.getCompletedTodos();
			}

			return this.todos;
		},
		destroyCompleted: function () {
			this.todos = this.getActiveTodos();
			this.filter = 'all';
			this.render();
		},
		// accepts an element from inside the `.item` div and
		// returns the corresponding index in the `todos` array
		indexFromEl: function (el) {
			var id = $(el).closest('li').data('id');
			var todos = this.todos;
			var i = todos.length;

			while (i--) {
				if (todos[i].id === id) {
					return i;
				}
			}
		},
		create: function (e) {
			var $input = $(e.target);
			var val = $input.val().trim();

			var selectedFood = _.find(foodList, function(food){
						return food.value == val;
					}),
					score = (typeof(selectedFood) !== 'undefined' ? selectedFood.score.toFixed(1) : null);

			var redYellowGreenNull;
			if (score == null){
				redYellowGreenNull = "";
			} else if (score < 6) {
				redYellowGreenNull = "redClass";
			} else if (score < 9) {
				redYellowGreenNull = "yellowClass";
			} else if (score < 10) {
				redYellowGreenNull = "greenClass";
			}

			if (e.which !== ENTER_KEY || !val) {
				return;
			}

			this.todos.push({
				id: util.uuid(),
				title: val,
				score: score,
				completed: false,
				colorClass: redYellowGreenNull
			});
			// console.log(selectedFood.colorClass);

			$input.val('');

			this.render();
		},
		toggle: function (e) {
			var i = this.indexFromEl(e.target);
			this.todos[i].completed = !this.todos[i].completed;
			this.render();
		},
		edit: function (e) {
			var $input = $(e.target).closest('li').addClass('editing').find('.edit');
			$input.val($input.val()).focus();
		},
		editKeyup: function (e) {
			if (e.which === ENTER_KEY) {
				e.target.blur();
			}

			if (e.which === ESCAPE_KEY) {
				$(e.target).data('abort', true).blur();
			}
		},
		suggestFood: function(name) {
      // find food by name
      var suggestFood = _.find(foodList, function(food){
        return food.value == name;
      });

      if(typeof(suggestFood) == 'undefined'){
				return [];
      }

      //find the selected food category
      var categoryFoods = _.filter(foodList, function(food){
        return suggestFood.category == food.category && food.value != suggestFood.value && food.score > suggestFood.score;
      });

      //sample 3
      categoryFoods = _.sample(categoryFoods, 3);

      //sort by scores
      categoryFoods = _.sortBy(categoryFoods, function(food){
				return food.score;
      }).reverse();

      _.each(categoryFoods, function(food){
				food.scoreDiff = '+' + (food.score - suggestFood.score).toFixed(1);
      });

      return categoryFoods;
    },
		update: function (e) {
			var el = e.target;
			var $el = $(el);
			var val = $el.val().trim();

			if ($el.data('abort')) {
				$el.data('abort', false);
				this.render();
				return;
			}

			var i = this.indexFromEl(el);

			if (val) {
				this.todos[i].title = val;
			} else {
				this.todos.splice(i, 1);
			}

			this.render();
		},
		updateScore: function(){
			var todos = _.filter(this.getFilteredTodos(), function(todo){
						return todo.score !== null;
					}),
					numTodos = todos.length,
					totalScore = (!!numTodos ? _.reduce(todos, function(memo, todo){
							var score = (todo.score !== null ? todo.score : 0);
							return parseFloat(score) + parseFloat(memo);
						}, 0) : 0),
					avgScore = (!!numTodos ? totalScore/numTodos : 0).toFixed(1);
					var totalPossiblePoints = numTodos * 100;
					$("#pointsNumber").text(parseInt(totalScore * 100, 10));
					$("#scoreNumber").text(" Total Reward Points");
			g.refresh(avgScore);


		},
		destroy: function (e) {
			this.todos.splice(this.indexFromEl(e.target), 1);
			this.render();
		}
	};

	App.init();
});

function recoClick(obj){
	var $food = $(obj),
			foodName = $food.text();

	var e = jQuery.Event("keyup");
	e.which = 13;
	$('#new-todo').val(foodName).trigger(e);
	return false;
}

