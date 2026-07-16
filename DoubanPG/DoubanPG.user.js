// ==UserScript==
// @name         豆瓣电影分级、搜索、跳转
// @namespace    Sam/DoubanPG
// @homepageURL  https://github.com/Samdogcom/MonkeyScript
// @version      0.6
// @description  修改自 https://greasyfork.org/zh-CN/scripts/429162-豆瓣电影分级 ，增加会剧透的分级描述，兼容豆瓣助手，增加电影站与豆瓣的相互跳转
// @author       Sam
// @icon         https://img3.doubanio.com/favicon.ico
// @match        *://movie.douban.com/subject/*
// @match        *://*.hao6v.cc/*
// @match        *://*.6vdyy.com/*
// @match        *://*.6v520.cc/*
// @match        *://*.6v520.com/*
// @match        *://*.6vdy.cc/*
// @match        *://*.6vw.cc/*
// @match        *://*.dygod.net/*
// @match        *://*.xiaopian.org/*
// @match        *://*.xiaopian.com/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      www.imdb.com
// @connect      api.graphql.imdb.com
// @require      https://fastly.jsdelivr.net/npm/encode-gb2312@0.0.2/encodeToGb2312.min.js
// ==/UserScript==
/* global encodeToGb2312 Swal unsafeWindow */

(function () {
    'use strict';

    // Your code here...
    // https://www.imdb.com/title/tt15398776/parentalguide

    const logTag = "Sam: ";
    const url = location.href;

    var info_item;
    var imdb_item;
    var imdb_id_item;
    var imdb_id;
    var douban_id;
    var douban_cn_name;
    var douban_cn_name_gbk;
    var douban_all_name;
    var douban_en_name;

    function get_imdb_item() {
        // 获取imdbitem
        info_item = document.querySelector("#info");
        imdb_item = document.evaluate('//span[text()="IMDb:"]', info_item, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        imdb_id_item = document.evaluate('//span[text()="IMDb:"]/following::text()[1]', info_item, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;

        // 获取imdb_id
        imdb_id = imdb_id_item.textContent.trim();

        // 获取douban_id
        douban_id = url.split("/")[4];

        // 获取douban_cn_name,标题格式为"片名 (豆瓣)",去掉首尾空白和"(豆瓣)"后缀
        douban_cn_name = document.title.replace(/\s*\(豆瓣\)\s*$/, "").trim();
        // 获取GBK编码的douban_cn_name
        douban_cn_name_gbk = encodeToGb2312(douban_cn_name).replace(/(.{2})/gi, "%$1");

        // 获取douban_en_name
        douban_all_name = document.querySelector("#content > h1 > span:nth-child(1)").innerHTML;
        douban_en_name = douban_all_name.split(douban_cn_name)[1];
        //纯中文名(无英文名)时split结果为undefined或空串,回退用中文名
        if (douban_en_name == null || douban_en_name.trim() == "") {
            douban_en_name = douban_cn_name;
        } else {
            douban_en_name = douban_en_name.trim();
        }
    }

    unsafeWindow.gDoc = "";

    unsafeWindow.getPG = function () {
        //失败后点击重试会再次进入,容器已存在时不重复插入
        if (document.querySelector("#pginfo") == null) {
            info_item.insertAdjacentHTML('beforeend', '<div id="pginfo"></div>');
            info_item.insertAdjacentHTML('beforeend', '<div id="infodetail"></div>');
        }
        if (PG_USE_API) {
            requestPGApi();
        } else {
            requestPG(0);
        }
    }

    //优先用GraphQL接口获取(能拿到全部条目和剧透),失败自动退回HTML解析方式
    const PG_USE_API = true;

    const pgCategories = [
        {id: "NUDITY", title: "性爱和裸体"},
        {id: "VIOLENCE", title: "暴力和血腥"},
        {id: "PROFANITY", title: "粗言俗语"},
        {id: "ALCOHOL", title: "酒精毒品和烟草"},
        {id: "FRIGHTENING", title: "恐怖和紧张场景"},
    ];

    function requestPGApi() {
        //网页版"See all"按钮调用的公开接口,单次请求可取回全部条目(含剧透)
        let query = 'query { title(id: "' + imdb_id + '") { parentsGuide { ' +
            'categories { category { id } severity { text } } ' +
            'guideItems(first: 250) { edges { node { category { id } isSpoiler text { plainText } } } } } } }';
        GM_xmlhttpRequest({
            method: "POST",
            url: "https://api.graphql.imdb.com/",
            headers: {"Content-Type": "application/json"},
            data: JSON.stringify({query: query}),
            timeout: 15000,
            onloadstart: function () {
                console.log(logTag + "正在通过API获取" + imdb_id);
                document.querySelector("#gpg").innerText = "正在获取";
            },
            onload: function (response) {
                try {
                    let json = JSON.parse(response.responseText);
                    if (response.status == 200 && json.data && json.data.title && json.data.title.parentsGuide) {
                        getPGHandleV3(json.data.title.parentsGuide);
                    } else {
                        apiFallback("接口返回异常");
                    }
                } catch (e) {
                    apiFallback("解析出错:" + e.message);
                }
            },
            ontimeout: function () {
                apiFallback("超时");
            },
            onerror: function () {
                apiFallback("网络错误");
            }
        })
    }

    function apiFallback(reason) {
        console.log(logTag + "API获取失败(" + reason + "),退回HTML解析方式");
        requestPG(0);
    }

    function escapeHtml(str) {
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function severitySpan(en) {
        let s = (en || "None").replace("None", "无").replace("Mild", "轻微").replace("Moderate", "中等").replace("Severe", "严重");
        let c = "#d0d0d0";
        if (s == "轻微") {
            c = "#c5e197"
        }
        if (s == "中等") {
            c = "#fbca8c"
        }
        if (s == "严重") {
            c = "#ffb3ad"
        }
        return '<span style="border-radius:2px;padding:3px 6px;background-color:' + c + '">' + s + '</span>';
    }

    unsafeWindow.pgData = null;

    function getPGHandleV3(guide) {
        //整理成 {NUDITY: {severity, items: [], spoilers: []}, ...}
        let data = {};
        for (let c of pgCategories) {
            data[c.id] = {severity: "", items: [], spoilers: []};
        }
        for (let cat of guide.categories) {
            let d = data[cat.category.id];
            if (d != null && cat.severity != null) {
                d.severity = cat.severity.text;
            }
        }
        for (let edge of guide.guideItems.edges) {
            let node = edge.node;
            let d = data[node.category.id];
            if (d != null) {
                (node.isSpoiler ? d.spoilers : d.items).push(node.text.plainText);
            }
        }
        unsafeWindow.pgData = data;

        document.querySelector("#gpg").innerText = "查看分级";
        let pgstr = "";
        let spoilerCount = 0;
        for (let c of pgCategories) {
            let d = data[c.id];
            spoilerCount += d.spoilers.length;
            pgstr += c.title + ":" + severitySpan(d.severity) + "<a href='javascript:getDetailV3(\"" + c.id + "\");'>(" + d.items.length + "条评论)</a><br>";
        }
        pgstr += "剧透: <a href='javascript:getDetailV3(\"SPOILERS\");'>(" + spoilerCount + "条评论)</a>";
        pgstr += "<a style='float:right' href='javascript:guideHide();'>隐藏分级</a><br>";
        document.querySelector('#pginfo').innerHTML = pgstr;
    }

    //隔行斑马纹,条目多时不看花眼,又不增加行间空白
    //用半透明黑而不是实色,白底/护眼插件换底色都能自适应压暗
    function itemRow(i, text) {
        let bg = i % 2 == 0 ? "background-color:rgba(0,0,0,0.08);" : "";
        return '<div style="padding:2px 4px;' + bg + '">' + (i + 1) + "." + escapeHtml(text) + '</div>';
    }

    unsafeWindow.getDetailV3 = function (id) {
        let data = unsafeWindow.pgData;
        if (data == null) {
            return;
        }
        let s = "";
        if (id == "SPOILERS") {
            //剧透按栏目分组,把标题读出来
            for (let c of pgCategories) {
                let sp = data[c.id].spoilers;
                if (sp.length == 0) {
                    continue;
                }
                s += c.title + ":<br>";
                for (let i = 0; i < sp.length; i++) {
                    s += itemRow(i, sp[i]);
                }
            }
            if (s == "") {
                s = "无剧透信息<br>";
            }
        } else {
            let items = data[id].items;
            for (let i = 0; i < items.length; i++) {
                s += itemRow(i, items[i]);
            }
        }
        s = "<a style='float:right' href='javascript:detailHide();'>收起</a><br>" + s;
        document.querySelector('#infodetail').innerHTML = s;
    }

    //失败自动重试次数
    const PG_MAX_RETRY = 2;

    function requestPG(retryCount) {
        let ss = "https://www.imdb.com/title/" + imdb_id + "/parentalguide";
        GM_xmlhttpRequest({
            method: "GET",
            url: ss,
            timeout: 15000,
            onloadstart: function () {
                console.log(logTag + "正在获取" + imdb_id + (retryCount > 0 ? ",第" + retryCount + "次重试" : ""));
                document.querySelector("#gpg").innerText = retryCount > 0 ? "正在获取(重试" + retryCount + ")" : "正在获取";
            },
            onload: function (response) {
                //IMDb偶尔返回403/503反爬页,不能拿去解析
                if (response.status == 200) {
                    unsafeWindow.getPGHandleV2(response.responseText);
                } else {
                    retryPG(retryCount, "HTTP " + response.status);
                }
            },
            ontimeout: function () {
                retryPG(retryCount, "超时");
            },
            onerror: function () {
                retryPG(retryCount, "网络错误");
            }
        })
    }

    function retryPG(retryCount, reason) {
        console.log(logTag + "获取分级失败:" + reason);
        if (retryCount < PG_MAX_RETRY) {
            setTimeout(function () {
                requestPG(retryCount + 1);
            }, 2000);
        } else {
            document.querySelector("#gpg").innerText = "获取失败(" + reason + "),点击重试";
        }
    }

    unsafeWindow.getField = function (doc, mark) {
        // let tmp = doc.querySelector("#advisory-" + mark + " .ipl-status-pill");
        let tmp = doc.querySelector('div[data-testid="sub-section-' + mark + '"]');
        if (tmp == null) {
            return "";
        } else {
            // let s = tmp.innerText.replace("None", "无");
            let s = tmp.previousElementSibling.firstChild.innerText;
            s = s.replace("None", "无");
            s = s.replace("Mild", "轻微");
            s = s.replace("Moderate", "中等");
            s = s.replace("Severe", "严重");
            let c;
            if (s == "无") {
                c = "#d0d0d0"
            }
            ;
            if (s == "轻微") {
                c = "#c5e197"
            }
            ;
            if (s == "中等") {
                c = "#fbca8c"
            }
            ;
            if (s == "严重") {
                c = "#ffb3ad"
            }
            ;
            return '<span style="border-radius:2px;padding:3px 6px;background-color:' + c + '">' + s + '</span>';
        }
    }

    unsafeWindow.getDetailNum = function (doc, mark) {
        // let tmp = doc.querySelectorAll("#advisory-" + mark + " li.ipl-zebra-list__item");
        let tmp = doc.querySelector('div[data-testid="sub-section-' + mark + '"]');
        if (tmp == null) {
            return 0;
        } else {
            // return tmp.length;
            return tmp.querySelectorAll('div[data-testid="item-id"]').length + "条评论";
        }
    }

    unsafeWindow.detailHide = function () {
        let detail = document.querySelector('#infodetail');
        if (detail != null) {
            detail.innerHTML = "";
        }
    }

    unsafeWindow.guideHide = function () {
        detailHide();
        let guide = document.querySelector('#pginfo');
        if (guide != null) {
            guide.innerHTML = "";
        }
    }

    unsafeWindow.getDetail = function (mark) {
        // 对应的细节描述 document.querySelectorAll("#advisory-violence li.ipl-zebra-list__item")
        // let tmp = unsafeWindow.gDoc.querySelectorAll("#advisory-" + mark + " li.ipl-zebra-list__item");
        let tmp = unsafeWindow.gDoc.querySelector('div[data-testid="sub-section-' + mark + '"]');
        if (tmp == null) {
            return 0;
        } else {
            let detail = document.querySelector('#infodetail');
            let posts = tmp.querySelectorAll('div[data-testid="item-id"]');
            let s = "";
            //剧透的把标题读出来
            if (mark == "spoilers") {
                s = getSpoilersDetail(mark);
            } else {
                for (var i = 0; i < posts.length; i++) {
                    s += itemRow(i, posts[i].textContent);
                }
            }
            s = s.replaceAll("Edit", "");
            s = "<a style='float:right' href='javascript:detailHide();'>收起</a><br>" + s;
            detail.innerHTML = s;
        }
    }

    unsafeWindow.getSpoilersDetail = function (mark) {
        // let tmp = unsafeWindow.gDoc.querySelectorAll("#advisory-" + mark + " section");
        let tmp = unsafeWindow.gDoc.querySelector('div[data-testid="sub-section-' + mark + '"]');
        let s = "";
        for (var i = 0; i < tmp.length; i++) {
            let title = tmp[i].getElementsByClassName("ipl-list-title")[0].textContent;
            if (title.toLowerCase().includes("nudity")) {
                title = "性爱和裸体:"
            } else if (title.toLowerCase().includes("violence")) {
                title = "暴力和血腥:"
            } else if (title.toLowerCase().includes("profanity")) {
                title = "粗言俗语:"
            } else if (title.toLowerCase().includes("alcohol")) {
                title = "酒精毒品和烟草:"
            } else if (title.toLowerCase().includes("frightening")) {
                title = "恐怖和紧张场景:"
            }
            s += title + "<br>";

            let content = tmp[i].getElementsByClassName("ipl-zebra-list__item");
            for (var j = 0; j < content.length; j++) {
                s += (j + 1) + "." + content[j].textContent + "<br>";
            }
        }
        return s;
    }

    unsafeWindow.getPGHandleV2 = function (html) {
        console.log("OK");
        document.querySelector("#gpg").innerText = "查看分级";
        let parser = new DOMParser();
        let doc = parser.parseFromString(html, "text/html");
        unsafeWindow.gDoc = doc;
        let nudity = getField(doc, "nudity") + "<a href='javascript:getDetail(\"nudity\");'>(" + getDetailNum(doc, "nudity") + ")</a>";
        let violence = getField(doc, "violence") + "<a href='javascript:getDetail(\"violence\");'>(" + getDetailNum(doc, "violence") + ")</a>";
        let profanity = getField(doc, "profanity") + "<a href='javascript:getDetail(\"profanity\");'>(" + getDetailNum(doc, "profanity") + ")</a>";
        let alcohol = getField(doc, "alcohol") + "<a href='javascript:getDetail(\"alcohol\");'>(" + getDetailNum(doc, "alcohol") + ")</a>";
        let fright = getField(doc, "frightening") + "<a href='javascript:getDetail(\"frightening\");'>(" + getDetailNum(doc, "frightening") + ")</a>";
        //增加剧透指引
        let spoilers = getField(doc, "spoilers") + "<a href='javascript:getDetail(\"spoilers\");'>(" + getDetailNum(doc, "spoilers") + ")</a>";
        let close = "<a style='float:right' href='javascript:guideHide();'>隐藏分级</a><br>"
        let pgstr = "性爱和裸体:" + nudity + "<br>暴力和血腥:" + violence + "<br>粗言俗语:" + profanity + "<br>酒精毒品和烟草:" + alcohol + "<br>恐怖和紧张场景:" + fright + "<br>剧透: " + spoilers + close;
        let info = document.querySelector('#pginfo');
        info.innerHTML = pgstr;
    }

    /**
     * 恢复IMDB链接
     */
    function imdb_link() {
        let div = document.createElement("div");
        div.innerHTML = "<span class='pl'>IMDb:</span><a target='_blank' href='https://www.imdb.com/title/" + imdb_id + "'>&nbsp" + imdb_id + "</a><br>";
        imdb_id_item.after(div);
        //删除原本的imdb链接
        imdb_item.remove();
        imdb_id_item.remove();

        //原来的删除了,所以要重新赋值,imdb_id_item已经无用
        imdb_item = div.firstChild;
    }

    /**
     * 侧边栏功能列表
     */
    const webSites = [
        {
            id: "group1",
            name: "影视资源",
            links: [
                {
                    name: "奈飞工厂",
                    url: "netflixgc.net",
                    search: "https://www.netflixgc.net/vodsearch/-------------.html?wd=",
                    id: "cn",
                },
                {
                    name: "iKanBot",
                    url: "ikanbot.com",
                    search: "https://v.ikanbot.com/search?q=",
                    id: "cn",
                },
                {
                    name: "七味",
                    url: "qwnull.com",
                    search: "https://www.qwnull.com/vs/-------------.html?wd=",
                    id: "cn",
                },
                {
                    name: "厂长资源",
                    url: "czzy89.com",
                    search: "https://www.czzy89.com/boss1O1?q=",
                    id: "cn",
                },
                {
                    name: "BTNULL",
                    url: "教父.com",
                    search: "https://www.教父.com/search?q=",
                    id: "cn",
                },
                {
                    name: "搜片",
                    url: "soupian.pro",
                    search: "https://soupian.pro/movie/",
                    id: "cn",
                },
            ],
        },
    ];

    function getKeyword(link) {
        let keyword = "";
        switch (link.id) {
            case "cn":
                keyword = douban_cn_name;
                break;
            case "gbk":
                keyword = douban_cn_name_gbk;
                break;
            case "all":
                keyword = douban_all_name;
                break;
            default:
                keyword = douban_en_name;
                break;
        }
        return keyword;
    }

    /**
     * 侧边栏功能
     */
    function aside() {
        let aside = document.querySelector(".aside");
        for (let webSite of webSites) {
            let div = document.createElement("div");
            div.className = "resource";
            if (true) {
                div.innerHTML = "<h2><i>" + webSite.name + "</i>· · · · · ·</h2>";
                aside.prepend(div);
                let ul = document.createElement("ul");
                ul.className = "resources";
                div.appendChild(ul);
                for (let link of webSite.links) {
                    if (link.type == "xhr") {
                        //特殊处理
                    } else {
                        let str = '<a href="' + link.search + getKeyword(link) + '" target="_blank">' + link.name + "</a>";
                        let a = document.createRange().createContextualFragment(str);
                        ul.appendChild(a);
                    }
                }
            }
        }

        const resourceStyle = document.createElement("style");
        resourceStyle.innerHTML =
            ".resource {margin-bottom: 30px}  .resources {padding: 0 12px;*letter-spacing: normal}  .resources a {border-radius: 6px;color: #37A;display: inline-block;letter-spacing: normal;margin: 0 8px 8px 0;padding: 0 8px;text-align: center;width: 65px}  .resources a:link, .resources a:visited {background-color: #f5f5f5;color: #37A}  .resources a:hover, .resources a:active {background-color: #e8e8e8;color: #37A}  .resources a.disabled {text-decoration: line-through}  .resources a.available {background-color: #5ccccc;color: #006363}  .resources a.available:hover, .resources a.available:active {background-color: #3cc}  .resources a.honse {background-color: #fff0f5;color: #006363}  .resources a.honse:hover, .resources a.honse:active {background-color: #3cc}  .resources a.sites_r0 {text-decoration: line-through}";
        document.head.appendChild(resourceStyle);
    }

    function htmlToElement(str) {
        return document.createRange().createContextualFragment(str);
    }

    function addDoubanSearch() {
        let h = document.getElementsByTagName("h1");
        if (!h || !h[0]) {
            return;
        }
        let name = h[0].innerText;
        if (name.includes("《")) {
            name = name.split("《")[1];
            name = name.split("》")[0];
        } else if (name.includes("【")) {
            name = name.split("【")[1];
            name = name.split("】")[0];
        }
        let search = "<a target='_blank' href='https://search.douban.com/movie/subject_search?search_text=" + encodeURIComponent(name) + "'; class='lnk-sharing'; style='margin-left: 5px'>豆瓣搜索</a>"
        h[0].innerHTML += search;

        /*        let img = document.getElementsByTagName("img");
                search = "<br>" + search + "<br>"
                for (var i = 0; i < img.length; i++) {
                    let src = img[i].getAttribute('src');
                    let alt = img[i].getAttribute('alt');
                    console.log(logTag + src);
                    //alt为空的是封面和截图
                    if (!alt && alt.trim().length == 0) {
                        let a = htmlToElement(search);
                        img[i].after(a);
                        //某些网页beforeBegin区分大小写
                        img[i].insertAdjacentHTML('beforeBegin', search);
                    }
                }*/

        let doubanUrl = 'https://search.douban.com/movie/subject_search?search_text=' + encodeURIComponent(name);
        let floatButton = document.createElement('div');
        floatButton.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:60px;height:60px;border-radius:50%;background-color:rgba(0,102,204,0.3);border:2px solid rgba(0,102,204,0.6);cursor:pointer;z-index:9999;display:flex;align-items:center;justify-content:center;transition:all 0.3s ease;';
        floatButton.innerHTML = '<span style="color:#0066cc;font-size:12px;font-weight:bold;text-align:center;">豆瓣</span>';
        floatButton.onclick = function () {
            window.open(doubanUrl, '_blank');
        };
        floatButton.onmouseenter = function () {
            this.style.backgroundColor = 'rgba(0,102,204,0.5)';
            this.style.transform = 'translate(-50%,-50%) scale(1.1)';
        };
        floatButton.onmouseleave = function () {
            this.style.backgroundColor = 'rgba(0,102,204,0.3)';
            this.style.transform = 'translate(-50%,-50%) scale(1)';
        };
        document.body.appendChild(floatButton);
    }

    if (window.location.href.includes("movie.douban.com/subject")) {
        get_imdb_item();

        //兼容豆瓣助手,不是超链接的话就恢复imdb链接
        let childItem = imdb_item.nextSibling;
        //JavaScript获取节点类型、节点名称和节点值，nodeName，nodeType，nodeValue
        console.log(logTag + childItem.nodeName);
        if (childItem.nodeName != "A") {
            imdb_link();
        } else {
            //只有是超链接时才能getAttribute('href'),否则就会出错
            let hrefValue = childItem.getAttribute('href');
            console.log(logTag + hrefValue);
        }

        let parentalguide = "<a target='_blank' href='https://www.imdb.com/title/" + imdb_id + "/parentalguide'; class='lnk-sharing'; style='margin-left: 5px'>直达</a>"
        imdb_item.nextSibling.nextSibling.insertAdjacentHTML('beforeBegin', '<a id="gpg" href="javascript:getPG();" class="lnk-sharing" style="margin-left: 5px;">查看分级</a>' + parentalguide);
        aside();
    } else {
        addDoubanSearch()
    }
})();