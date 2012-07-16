// ==UserScript==
// @name			眼不见心不烦（新浪微博）
// @namespace		http://weibo.com/salviati
// @license			MIT License
// @description		在新浪微博（weibo.com）中隐藏包含指定关键词的微博。
// @features		增加极简阅读模式；增加反版聊功能；设置窗口可以拖动；增加单独的屏蔽来源功能；增加自定义屏蔽版面内容功能；可屏蔽已删除微博的转发；可屏蔽写心情微博；增加对微博精选模块的屏蔽；修正网速较慢时脚本失效的问题
// @version			0.9b6
// @revision		52
// @author			@富平侯(/salviati)
// @committer		@牛肉火箭(/sunnylost)；@JoyerHuang_悦(/collger)
// @match			http://weibo.com/*
// @match			http://www.weibo.com/*
// @updateURL		https://userscripts.org/scripts/source/114087.meta.js
// @downloadURL		https://userscripts.org/scripts/source/114087.user.js
// ==/UserScript==

var $version, $revision;
var $uid;
var $blocks = [ // 模块屏蔽设置
		['Topic', '#pl_content_promotetopic, #trustPagelete_zt_hottopic'],
		['InterestUser', '#pl_content_homeInterest, #trustPagelete_recom_interest'],
		['InterestApp', '#pl_content_allInOne, #trustPagelete_recom_allinone'],
		['Notice', '#pl_common_noticeboard, #pl_rightmod_noticeboard'],
		['HelpFeedback', '#pl_common_help, #pl_common_feedback, #pl_rightmod_help, #pl_rightmod_feedback, #pl_rightmod_tipstitle'],
		['Ads', '#plc_main .W_main_r div[id^="ads_"], div[ad-data], #ads_bottom_1'],
		['PullyList', '#pl_content_pullylist, #pl_content_biztips'],
		['RecommendedTopic', '#pl_content_publisherTop div[node-type="recommendTopic"]'],
		['Mood', '#pl_content_mood'],
		['Medal', '#pl_content_medal, #pl_rightmod_medal, .declist'],
		['Game', '#pl_leftNav_game'],
		['App', '#pl_leftNav_app'],
		['Tasks', '#pl_content_tasks'],
		['UserGuide', '#pl_guide_oldUser'],
		['Promotion', '#pl_rightmod_promotion, #trustPagelet_ugrowth_invite'],
		['Level', '#pl_content_personInfo p.level, #pl_leftNav_common dd.nameBox p, #pl_content_hisPersonalInfo span.W_level_ico'],
		['Member', '#trustPagelet_recom_member'],
		['MemberIcon', '.ico_member'],
		['VerifyIcon', '.approve, .approve_co'],
		['DarenIcon', '.ico_club'],
		['VgirlIcon', '.ico_vlady'],
		['Oly361', '.ico_oly361'],
		['Custom']
	];
var $options = {}, $forwardFeeds = {}, $settingsWindow;

var _ = function (s) {
	return document.getElementById(s);
};
var __ = function (s) {
	return document.querySelector(s);
};
// 绑定事件
var bind = function (el, eventName, handler) {
	el && el.addEventListener(eventName, handler, false);
};
// click事件快捷方式
var click = function (el, handler) {
	bind(el, 'click', handler);
};

function getScope() {
	return "B_index" === document.body.className ? 1 : "B_my_profile_other" === document.body.className ? 2 : 0;
}

// Chrome提供的GM_getValue()等有问题（早期版本则不支持），需要使用localStorage重新定义
// Firefox 2+, Internet Explorer 8+, Safari 4+和Chrome均支持DOM Storage (HTML5)
if (window.localStorage) {
	var keyRoot = 'weiboPlus.';

	var GM_deleteValue = function (name) {
		localStorage.removeItem(keyRoot + name);
	};

	var GM_getValue = function (name, defval) {
		return localStorage.getItem(keyRoot + name) || defval;
	};

	var GM_setValue = function (name, value) {
		localStorage.setItem(keyRoot + name, value);
	};
}

// 对于Chrome和Opera，通过脚本注入获得unsafeWindow
var $window = ('chrome' in window || 'opera' in window) ? (function () {
		var e = document.createElement('p');
		e.setAttribute('onclick', 'return window;');
		return e.onclick();
	}()) : unsafeWindow;
	
// 搜索指定文本中是否包含列表中的关键词
function searchKeyword(str, key) {
	var text = str.toLowerCase(), keywords = $options[key], keyword, i, len;
	if (str === '' || keywords === undefined) {return ''; }
	for (i = 0, len = keywords.length; i < len; ++i) {
		keyword = keywords[i];
		if (!keyword) {continue; }
		if (keyword.length > 2 && keyword.charAt(0) === '/' && keyword.charAt(keyword.length - 1) === '/') {
			try {
				// 尝试匹配正则表达式
				if (RegExp(keyword.substring(1, keyword.length - 1)).test(str)) {return keyword; }
			} catch (e) {
				continue;
			}
		} else if (text.indexOf(keyword.toLowerCase()) > -1) {
			return keyword;
		}
	}
	return '';
}

function filterSource(source) {
	if (!source) {
		source = '未通过审核应用';
	} else {
		// 过长的应用名称会被压缩，完整名称存放在title属性中
		source = source.title ? source.title : source.innerHTML;
	}
	return searchKeyword(source, 'sourceKeywords') !== ''
}

function showFeed(node, fwdLink) {
	node.style.display = '';
	node.childNodes[1].style.display = '';
	node.childNodes[3].style.display = '';
	node.childNodes[1].style.opacity = 1;
	node.childNodes[3].style.opacity = 1;
	if (!$options.filterPaused && $options.filterDupFwd && fwdLink) {
		$forwardFeeds[fwdLink.href] = node.getAttribute('mid');
	}
}

function filterFeed(node) {
	if (node.firstChild.tagName === 'A') {node.removeChild(node.firstChild); } // 已被屏蔽过
	var scope = getScope(), text = '@', isForward = (node.getAttribute('isforward') === '1'),
		content = node.querySelector('dd.content > p[node-type="feed_list_content"]'),
		forwardContent = node.querySelector('dd.content > dl.comment > dt[node-type="feed_list_forwardContent"]'),
		forwardLink = node.querySelector('dd.content > dl.comment > dd.info > a.date');
	if (!content) {return false; }	
	if (scope === 2) {text = ''; } // 他人主页没有原作者链接
	text += content.textContent.replace(/[\r\n\t]/g, '').trim();
	if (isForward) {
		// 转发内容
		text += '//' + forwardContent.textContent.replace(/[\r\n\t]/g, '').trim();
	}
	if ($options.filterPaused || searchKeyword(text, 'whiteKeywords')) { // 白名单检查
		showFeed(node, forwardLink);
		return false;
	}
	// 屏蔽已删除微博的转发
	if ($options.filterDeleted && isForward && forwardContent.childNodes[1].tagName === 'EM') { // 已删除微博的转发，原文中没有原作者链接
		node.style.display = 'none'; // 直接隐藏，不显示屏蔽提示
		return true;
	}
	// 屏蔽写心情微博
	if ($options.filterFeelings && node.querySelector('dd.content > div.feelingBoxS')) {
		node.style.display = 'none'; // 直接隐藏，不显示屏蔽提示
		return true;	
	}
	// 屏蔽指定来源
	if (filterSource(node.querySelector('dd.content > p.info > a[target="_blank"]')) || 
		(isForward && filterSource(node.querySelector('dd.content > dl.comment > dd.info > a[target="_blank"]')))) {
		node.style.display = 'none'; // 直接隐藏，不显示屏蔽提示
		return true;
	}
	// 反版聊（屏蔽重复转发）
	if ($options.filterDupFwd && isForward) {
		var mid = $forwardFeeds[forwardLink.href];
		if (mid) {
			var lastShown = __('dl.feed_list[mid="' + mid + '"]');
			if (lastShown && lastShown.style.display !== 'none') {
				node.style.display = 'none'; // 直接隐藏，不显示屏蔽提示
				return true;
			}
		}
	}
	// 在微博内容中搜索屏蔽关键词
	if (searchKeyword(text, 'blackKeywords')) {
		node.style.display = 'none'; // 直接隐藏，不显示屏蔽提示
		return true;
	}
	// 搜索t.cn短链接
	var links = node.getElementsByTagName('A'), i, len;
	for (i = 0, len = links.length; i < len; ++i) {
		if (links[i].href.substring(0, 12) === 'http://t.cn/' && searchKeyword(links[i].title, 'URLKeywords')) {
			node.style.display = 'none';
			return true;
		}
	}
	node.style.display = '';
	var keyword = searchKeyword(text, 'grayKeywords');
	if (!keyword) {
		showFeed(node, forwardLink);
		return false;
	}
	var authorClone;
	if (scope === 1) {
		// 2011年11月15日起，新浪微博提供了屏蔽功能，由于屏蔽按钮的存在，微博发布者链接的位置发生了变化
		var author = content.childNodes[1];
		node.childNodes[3].style.display = 'none';
		// 添加隐藏提示链接
		authorClone = author.cloneNode(false);
		// 默认的用户链接中多了一个换行符和两个tab
		authorClone.innerHTML = '@' + author.innerHTML.slice(3);
	}
	// 找到了待隐藏的微博
	node.childNodes[1].style.display = 'none';
	var tipBackColor = $options.tipBackColor || '#FFD0D0';
	var tipTextColor = $options.tipTextColor || '#FF8080';
	var showFeedLink = document.createElement('a');
	showFeedLink.href = 'javascript:void(0)';
	showFeedLink.className = 'notes';
	showFeedLink.style.cssText = 'background-color: ' + tipBackColor + '; border-color: ' + tipTextColor + '; color: ' + tipTextColor + '; margin-bottom: 0px; height: auto;';
	var keywordLink = document.createElement('a');
	keywordLink.href = 'javascript:void(0)';
	keywordLink.innerHTML = keyword;
	click(keywordLink, function (event) {
		showSettingsWindow(event);
		event.stopPropagation(); // 防止事件冒泡触发屏蔽提示的onclick事件
	});
	if (scope === 1) {
		showFeedLink.appendChild(document.createTextNode('本条来自'));
		showFeedLink.appendChild(authorClone);
		showFeedLink.appendChild(document.createTextNode('的微博因包含关键词“'));
	} else if (scope === 2) {
		showFeedLink.appendChild(document.createTextNode('本条微博因包含关键词“'));
	}
	showFeedLink.appendChild(keywordLink);
	showFeedLink.appendChild(document.createTextNode('”而被隐藏，点击显示'));
	click(showFeedLink, function () {
		this.parentNode.childNodes[2].style.opacity = 1;
		this.parentNode.childNodes[4].style.opacity = 1;
		this.parentNode.removeChild(this);
	});
	bind(showFeedLink, 'mouseover', function () {
		this.parentNode.childNodes[2].style.display = '';
		this.parentNode.childNodes[4].style.display = '';
		this.parentNode.childNodes[2].style.opacity = 0.5;
		this.parentNode.childNodes[4].style.opacity = 0.5;
		this.style.cssText = 'background-color: #D0FFD0; border-color: #40D040; color: #40D040; height: auto;';
	});
	bind(showFeedLink, 'mouseout', function () {
		if (!this.parentNode) {return; }
		this.parentNode.childNodes[2].style.display = 'none';
		this.parentNode.childNodes[4].style.display = 'none';
		this.parentNode.style.cssText = '';
		this.style.cssText = 'background-color: ' + tipBackColor + '; border-color: ' + tipTextColor + '; color: ' + tipTextColor + '; margin-bottom: 0px; height: auto;';
	});
	node.insertBefore(showFeedLink, node.firstChild);
	return true;
}

var $loadingState = null;

function asyncLoad() {
	// 由于新浪微博使用了BigPipe技术，从"@我的微博"等页面进入时只载入部分页面
	// 各版块载入顺序不定，脚本运行时可能页面尚未载入完成，在网速较慢时尤为明显
	// 需要等待页面载入完成时重新载入设置按钮及刷新微博列表
	// 载入顺序[内容(依赖)]：$options($CONFIG.$uid) -> [设置按钮(STK.ui.dialog); 微博列表(.feed_lists)]
	if (getScope() === 0) {
		return $loadingState = null;
	}
	if (!$loadingState) { // 包括0, null和undefined
		if (!$window.$CONFIG) {
			return $loadingState = 0;
		}
		$uid = $window.$CONFIG.uid;
		if (!reloadSettings()) {
			alert('“眼不见心不烦”设置读取失败！\n设置信息格式有问题。');
		}
		GM_addStyle('#settings.css#');
		$loadingState = 1;
	}
	if (($loadingState & 1) && !($loadingState & 2)) {
		try {
			if (typeof $window.STK.ui.dialog === 'function' && showSettingsBtn()) {
				$loadingState |= 2;
			}
		} catch (e) { }
	}
	if (($loadingState & 1) && !($loadingState & 4) && __('div.feed_lists dl.feed_list')) {
		applySettings();
		$loadingState |= 4;
	}
	if ($loadingState !== 7) {
		setTimeout(asyncLoad, 1000);
	}
	return $loadingState;
}

// 处理动态载入内容
function onDOMNodeInsertion(event) {
	if (getScope() === 0) {
		$loadingState = null;
		return false; 
	} else if ($loadingState === null) {
		// 第一次载入或从其它页面转入作用范围内页面
		$loadingState = 0;
		asyncLoad();
	}
	var node = event.target;
	if (node.tagName === 'DL' && node.classList.contains('feed_list')) {
		// 处理动态载入的微博
		return filterFeed(node);
	}
	return false;
}

// 检查更新
function checkUpdate() {
	GM_xmlhttpRequest({
		method: 'GET',
		// 只载入metadata
		url: 'http://userscripts.org/scripts/source/114087.meta.js',
		onload: function (result) {
			if (!result.responseText.match(/@version\s+(.*)/)) {return; }
			var ver = RegExp.$1;
			if (!result.responseText.match(/@revision\s+(\d+)/) || RegExp.$1 <= $revision) {
				alert('脚本已经是最新版。');
				return;
			}
			var features = '';
			if (result.responseText.match(/@features\s+(.*)/)) {
				features = '- ' + RegExp.$1.split('；').join('\n- ') + '\n\n';
			}
			// 显示更新提示
			if (confirm('“眼不见心不烦”新版本v' + ver + '可用。\n\n' + features + '如果您希望更新，请点击“确认”打开插件主页。')) {
				window.open('http://userscripts.org/scripts/show/114087');
			}
		}
	});
}

// 极简阅读模式（仅在个人首页生效）
function readerMode() {
	var readerModeStyles = _('wbpReaderModeStyles');
	if (getScope() === 1 && $options.readerMode === true) {		
		if (!readerModeStyles) {
			readerModeStyles = document.createElement('style');
			readerModeStyles.type = 'text/css';
			readerModeStyles.id = 'wbpReaderModeStyles';
			document.head.appendChild(readerModeStyles);
		}
		if (_('Box_left')) { // 体验版
			readerModeStyles.innerHTML = '#Box_left, #Box_right, #pl_content_publisherTop, .global_footer, #wbim_box { display: none; } #pl_content_top .global_header {top: -35px; } #Box_center { width: 800px; } .W_miniblog { background-position-y: -35px; } .W_main { padding-top: 17px; width: 845px; } .W_main_bg { background: ' + $options.readerModeBackColor + '; } .feed_list .repeat .input textarea { width: 688px; } #base_scrollToTop { margin-left: 424px; }';
		} else { // 传统版
			readerModeStyles.innerHTML = '#plc_main .W_main_r, #pl_content_publisherTop, .global_footer, #wbim_box { display: none; } #pl_content_top .global_header {top: -35px; } #plc_main .W_main_c { width: 800px; } .W_miniblog { background-position-y: -35px; } #plc_main .custom_content_bg { padding-top: 30px; } .W_main_narrow { padding-top: 17px; } .W_main_narrow_bg { background: ' + $options.readerModeBackColor + '; } .feed_list .repeat .input textarea { width: 628px; }';
		}
	} else {
		if (readerModeStyles) document.head.removeChild(readerModeStyles);
	}
}

// 检测按键，开关极简阅读模式和屏蔽开关
function onKeyPress(event) {
	if (!$loadingState) {return; }
	if (getScope() === 1 && event.keyCode === 119) {
		$options.readerMode = !$options.readerMode;
		GM_setValue($uid.toString(), JSON.stringify($options));
		readerMode();
	} else if (getScope() && event.keyCode === 120) {
		$options.filterPaused = !$options.filterPaused;
		GM_setValue($uid.toString(), JSON.stringify($options));
		applySettings();
	}
}
			 
// 根据当前设置屏蔽/显示所有内容
function applySettings() {
	// 处理非动态载入内容
	var feeds = document.querySelectorAll('.feed_list'), i, len, j, l;
	$forwardFeeds = {};
	for (i = 0, len = feeds.length; i < len; ++i) {filterFeed(feeds[i]); }
	// 极简阅读模式
	readerMode();
	// 屏蔽版面内容
	var cssText = '';
	for (i = 0, len = $blocks.length; i < len; ++i) {
		if ($options.hideBlock && $options.hideBlock[$blocks[i][0]] === true) {
			if ($blocks[i][0] === 'RecommendedTopic') {
				// 推荐话题的display属性在微博输入框获得焦点时被重置，
				// 因此需要通过设置visibility属性实现隐藏
				cssText += $blocks[i][1] + ' { visibility: hidden; } ';
			} else if ($blocks[i][0] === 'Custom') {
				// 自定义屏蔽
				if ($options.customBlocks.length) {
					cssText += $options.customBlocks.join(', ') + ' { display: none; } ';
				}
			} else {
				cssText += $blocks[i][1] + ' { display: none; } ';
			}
		}
	}
	blockStyles = _('wbpBlockStyles');
	if (!blockStyles) {
		blockStyles = document.createElement('style');
		blockStyles.type = 'text/css';
		blockStyles.id = 'wbpBlockStyles';
		document.head.appendChild(blockStyles);
	}
	blockStyles.innerHTML = cssText + '\n';
}

// 载入/导入设置更新$options
function reloadSettings(str) {
	$options = {};
	var options = str || GM_getValue($uid.toString(), '');
	if (options) {
		try {
			$options = JSON.parse(options.replace(/\n/g, ''));
			//if (typeof $options !== 'object') {throw 0; }
		} catch (e) {
			return false;
		}
	}
	return true;
}

// 显示设置窗口
function showSettingsWindow() {
	if ($settingsWindow) {
		$settingsWindow.show().setMiddle();
		return;
	}
	// 创建设置窗口
	$settingsWindow = $window.STK.ui.dialog({isHold: true});
	$settingsWindow.setTitle('“眼不见心不烦”(v' + $version + ')设置');
	var content = $window.STK.module.layer('#settings.html#');
	$settingsWindow.setContent(content.getOuter());
		
	var getDom = function (node) {
		return content.getDom(node);
	}
	var STKbind = function (node, func, event) {
		$window.STK.core.evt.addEvent(content.getDom(node), event ? event : 'click', func);
	}
	// 从显示列表建立关键词数组
	var getKeywords = function (id) {
		if (!getDom(id).hasChildNodes()) {return []; }
		var keywords = getDom(id).childNodes, list = [], i, len;
		for (i = 0, len = keywords.length; i < len; ++i) {
			if (keywords[i].tagName === 'A') {list.push(keywords[i].innerHTML); }
		}
		return list;
	}

	// 将关键词添加到显示列表
	var addKeywords = function (id, list) {
		var keywords = list instanceof Array ? list : list.split(' '),
			i, len, malformed = [];
		for (i = 0, len = keywords.length; i < len; ++i) {
			var currentKeywords = ' ' + getKeywords(id).join(' ') + ' ', keyword = keywords[i];
			if (keyword && currentKeywords.indexOf(' ' + keyword + ' ') === -1) {
				var keywordLink = document.createElement('a');
				if (keyword.length > 2 && keyword.charAt(0) === '/' && keyword.charAt(keyword.length - 1) === '/') {
					try {
						// 尝试创建正则表达式，检验正则表达式的有效性
						// 调用test()是必须的，否则浏览器可能跳过该语句
						RegExp(keyword.substring(1, keyword.length - 1)).test('');
					} catch (e) {
						malformed.push(keyword);
						continue;
					}
					keywordLink.className = 'regex';
				}
				keywordLink.title = '删除关键词';
				keywordLink.setAttribute('action-type', 'remove');
				keywordLink.href = 'javascript:void(0)';
				keywordLink.innerHTML = keyword;
				getDom(id).appendChild(keywordLink);
			}
		}
		if (malformed.length > 0) {
			alert('下列正则表达式无效：\n' + malformed.join('\n'));
		}
		return malformed.join(' ');
	}

	// 根据当前设置（可能未保存）更新$options
	var updateSettings = function () {
		var options = {
			whiteKeywords : getKeywords('whiteKeywordList'),
			blackKeywords : getKeywords('blackKeywordList'),
			grayKeywords : getKeywords('grayKeywordList'),
			URLKeywords : getKeywords('URLKeywordList'),
			sourceKeywords : getKeywords('sourceKeywordList'),
			tipBackColor : getDom('tipBackColor').value,
			tipTextColor : getDom('tipTextColor').value,
			readerMode: getDom('readerMode').checked,
			readerModeBackColor : getDom('readerModeBackColor').value,
			filterPaused : getDom('filterPaused').checked,
			filterDupFwd : getDom('filterDupFwd').checked,
			filterDeleted : getDom('filterDeleted').checked,
			filterFeelings : getDom('filterFeelings').checked,
			hideBlock : {},
			customBlocks : []
		};
		var i, len, blocks = getDom('customBlocks').value.split('\n'), block;
		for (i = 0, len = $blocks.length; i < len; ++i) {
			options.hideBlock[$blocks[i][0]] = getDom('block' + $blocks[i][0]).checked;
		}
		for (i = 0, len = blocks.length; i < len; ++i) {
			block = blocks[i].trim();
			if (block) { options.customBlocks.push(block); }
		}
		getDom('settingsString').value = JSON.stringify(options);
		return options;
	}

	// 更新设置窗口内容，updateSettings()的反过程
	var updateSettingsWindow = function () {
		getDom('readerMode').checked = ($options.readerMode === true);
		getDom('readerModeBackColor').value = $options.readerModeBackColor || 'rgba(100%, 100%, 100%, 0.8)';
		getDom('filterPaused').checked = ($options.filterPaused === true);
		getDom('filterDupFwd').checked = ($options.filterDupFwd === true);
		getDom('filterDeleted').checked = ($options.filterDeleted === true);
		getDom('filterFeelings').checked = ($options.filterFeelings === true);
		getDom('whiteKeywordList').innerHTML = '';
		getDom('blackKeywordList').innerHTML = '';
		getDom('grayKeywordList').innerHTML = '';
		getDom('URLKeywordList').innerHTML = '';
		getDom('sourceKeywordList').innerHTML = '';
		addKeywords('whiteKeywordList', $options.whiteKeywords || '');
		addKeywords('blackKeywordList', $options.blackKeywords || '');
		addKeywords('grayKeywordList', $options.grayKeywords || '');
		addKeywords('URLKeywordList', $options.URLKeywords || '');
		addKeywords('sourceKeywordList', $options.sourceKeywords || '');
		getDom('whiteKeywords').value = '';
		getDom('blackKeywords').value = '';
		getDom('grayKeywords').value = '';
		getDom('URLKeywords').value = '';
		getDom('sourceKeywords').value = '';
		var tipBackColor = $options.tipBackColor || '#FFD0D0';
		var tipTextColor = $options.tipTextColor || '#FF8080';
		getDom('tipBackColor').value = tipBackColor;
		getDom('tipTextColor').value = tipTextColor;
		var tipSample = getDom('tipSample');
		tipSample.style.backgroundColor = tipBackColor;
		tipSample.style.borderColor = tipTextColor;
		tipSample.style.color = tipTextColor;
		if ($options.hideBlock) {
			var i, len;
			for (i = 0, len = $blocks.length; i < len; ++i) {
				getDom('block' + $blocks[i][0]).checked = ($options.hideBlock[$blocks[i][0]] === true);
			}
		}
		if ($options.customBlocks) {
			getDom('customBlocks').value = $options.customBlocks.join('\n');
		} else {
			getDom('customBlocks').value = '';
		}
		getDom('settingsString').value = JSON.stringify($options);
	}
	
	// 修改屏蔽提示颜色事件
	STKbind('tipBackColor', function () {
		getDom('tipSample').style.backgroundColor = this.value;
	}, 'blur');
	STKbind('tipTextColor', function () {
		getDom('tipSample').style.borderColor = this.value;
		getDom('tipSample').style.color = this.value;
	}, 'blur');
	var events = $window.STK.core.evt.delegatedEvent(content.getInner());
	// 添加关键词按钮点击事件
	events.add('add', 'click', function (action) {
		getDom(action.data.text).value = addKeywords(action.data.list, getDom(action.data.text).value);
	});
	// 清空关键词按钮点击事件
	events.add('clear', 'click', function (action) {
		getDom(action.data.list).innerHTML = '';
	});
	// 删除关键词事件
	events.add('remove', 'click', function (action) {
		action.el.parentNode.removeChild(action.el);
	});
	// 标签点击事件
	STKbind('tabHeaders', function (event) {
		var node = event.target, i, len;
		if (node && node.tagName === 'A') {
			node.className = 'current';
			getDom(node.getAttribute('tab')).style.display = '';
			for (i = 0, len = this.childNodes.length; i < len; ++i) {
				if (node !== this.childNodes[i]) {
					this.childNodes[i].className = '';
					getDom(this.childNodes[i].getAttribute('tab')).style.display = 'none';
				}
			}
		}
	});
	STKbind('tabHeaderSettings', updateSettings);
	STKbind('blockAll', function () {
		var i, len;
		for (i = 0, len = $blocks.length; i < len; ++i) {
			getDom('block' + $blocks[i][0]).checked = true;
		}
	});
	STKbind('blockInvert', function () {
		var i, len, item;
		for (i = 0, len = $blocks.length; i < len; ++i) {
			item = getDom('block' + $blocks[i][0]);
			item.checked = !item.checked;
		}
	});
	// 对话框按钮点击事件
	STKbind('import', function () {
		if (reloadSettings(getDom('settingsString').value)) {
			updateSettingsWindow();
			alert('设置导入成功！'); 
		} else {
			alert('设置导入失败！\n设置信息格式有问题。');	
		}
	});
	STKbind('checkUpdate', checkUpdate);
	STKbind('OK', function () {
		$options = updateSettings();
		GM_setValue($uid.toString(), JSON.stringify($options));
		applySettings();
		$settingsWindow.hide();
	});
	STKbind('cancel', $settingsWindow.hide);
	// 显示窗口时自动更新设置
	$window.STK.custEvent.add($settingsWindow, "show", updateSettingsWindow);
	$settingsWindow.show().setMiddle();
}

function showSettingsBtn() {
	// 设置标签已经置入页面
	if (_('wbpShowSettings')) {return true; }
	var groups = __('#pl_content_homeFeed .nfTagB, #pl_content_hisFeed .nfTagB');
	// Firefox的div#pl_content_homeFeed载入时是空的，此时无法置入页面，稍后由onDOMNodeInsertion()处理
	if (!groups) {return false; }
	var showSettingsTab = document.createElement('li');
	showSettingsTab.innerHTML = '<span><em><a id="wbpShowSettings" href="javascript:void(0)">眼不见心不烦</a></em></span>';
	groups.childNodes[1].appendChild(showSettingsTab);
	click(_('wbpShowSettings'), showSettingsWindow);
	return true;
}

// 等待页面载入完成
asyncLoad();

// 处理动态载入内容
document.addEventListener('DOMNodeInserted', onDOMNodeInsertion, false);
// 处理按键（极简阅读模式）
document.addEventListener("keyup", onKeyPress, false);