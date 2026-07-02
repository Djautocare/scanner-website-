const InventoryWorkspace = (function(){
    const CACHE_KEY = "inventoryos_workspace";

    const SKIP_TAGS = new Set([
        "SCRIPT",
        "STYLE",
        "NOSCRIPT",
        "CODE",
        "PRE",
        "SVG",
        "PATH"
    ]);

    const PROTECTED_CONTENT_SELECTOR = [
        ".box-notes",
        ".content-row",
        ".result-title",
        ".sale-title",
        ".suggest-title",
        ".match-title",
        ".product-name",
        ".item-name",
        ".product-description",
        ".choice-button",
        ".live-result-button",
        ".suggest-item",
        ".match-item",
        ".selected-bundle-item",
        "[data-location-wording-ignore]"
    ].join(",");

    const UI_TEXT_SELECTOR = [
        "title",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "label",
        "summary",
        ".subtitle",
        ".input-label",
        ".helper-text",
        ".small-note",
        ".stat-label",
        ".highlight-card",
        ".warning-text",
        ".capacity-text",
        ".empty-state",
        ".section-title",
        ".section-badge",
        ".preview-title",
        ".link-card",
        ".toggle-box",
        ".box-group-title",
        ".box-group-line small",
        ".location-title",
        ".status-line",
        "#boxHint",
        "#progressBox",
        "#saveStatus",
        "#qzStatus",
        "button"
    ].join(",");

    let observer = null;

    function hasInventoryAPI(){
        return (
            typeof InventoryAPI !== "undefined" &&
            InventoryAPI
        );
    }

    async function load(){
        const data = await InventoryAPI.request(
            "/workspaces/current"
        );

        if(data.success && data.workspace){
            localStorage.setItem(
                CACHE_KEY,
                JSON.stringify(data.workspace)
            );

            return data.workspace;
        }

        return getCached();
    }

    function getCached(){
        try{
            return JSON.parse(
                localStorage.getItem(CACHE_KEY) ||
                "null"
            );
        }catch(error){
            return null;
        }
    }

    function getSettings(){
        const workspace = getCached();

        return workspace?.settings || {
            location_label_singular:"Box",
            location_label_plural:"Boxes",
            location_icon:"📦",
            auto_create_locations:true,
            show_auto_create_location_option:true
        };
    }

    function singular(){
        return (
            getSettings().location_label_singular ||
            "Box"
        );
    }

    function plural(){
        return (
            getSettings().location_label_plural ||
            "Boxes"
        );
    }

    function icon(){
        return (
            getSettings().location_icon ||
            "📦"
        );
    }

    function matchCase(source, replacement){
        const value = String(source || "");
        const output = String(replacement || "");

        if(!value){
            return output;
        }

        if(value === value.toUpperCase()){
            return output.toUpperCase();
        }

        if(value === value.toLowerCase()){
            return output.toLowerCase();
        }

        if(
            value[0] === value[0].toUpperCase() &&
            value.slice(1) === value.slice(1).toLowerCase()
        ){
            return (
                output.charAt(0).toUpperCase() +
                output.slice(1)
            );
        }

        return output;
    }

    function isRealLocationName(text, matchIndex, matchLength){
        const after = String(text || "")
            .slice(matchIndex + matchLength);

        /*
            Keep actual stored location names unchanged:
            BOX-15
            Box 15
            BOX_15
            BOX #15
        */
        return /^\s*(?:[-_#]\s*)?\d/i.test(after);
    }

    function isMysteryBoxPhrase(text, matchIndex){
        const before = String(text || "")
            .slice(0, matchIndex);

        /*
            "Mystery Box" and "Mystery Boxes" are product/business wording,
            not storage-location terminology.
        */
        return /mystery\s*$/i.test(before);
    }

    function replaceLocationWords(value){
        const settings = getSettings();
        const singularLabel =
            settings.location_label_singular || "Box";
        const pluralLabel =
            settings.location_label_plural || "Boxes";

        return String(value || "").replace(
            /\bboxes\b|\bbox\b/gi,
            function(match, offset, fullText){
                if(
                    isRealLocationName(
                        fullText,
                        offset,
                        match.length
                    )
                ){
                    return match;
                }

                if(
                    isMysteryBoxPhrase(
                        fullText,
                        offset
                    )
                ){
                    return match;
                }

                const replacement =
                    /^boxes$/i.test(match)
                        ? pluralLabel
                        : singularLabel;

                return matchCase(
                    match,
                    replacement
                );
            }
        );
    }

    function looksLikeLocationUiText(value){
        const text = String(value || "");

        if(!/\bboxes?\b/i.test(text)){
            return false;
        }

        /*
            Only translate recognised interface wording. This prevents product
            names or user notes such as "box of screws" being altered.
        */
        const patterns = [
            /\b(active|empty|largest|smallest)\s+boxes?\b/i,
            /\bboxes?\s+(locations?|labels?|suggestions?|number|move|contents?|available|created|found|shown)\b/i,
            /\b(create|created|creating|select|selected|choose|loading|load|print|return|search|sort|move|moving|moved)\b[\s\S]{0,45}\bboxes?\b/i,
            /\bboxes?\b[\s\S]{0,45}\b(create|created|select|selected|choose|loading|load|print|return|search|sort|move|moving|moved|location|label|number|suggestion|content|available|found)\b/i,
            /\bbulk\s+box\s+move\b/i,
            /\bwhole\s+box\b/i,
            /\bgrouped\s+by\s+box\b/i,
            /\bfrom\s+box\b/i,
            /\bto\s+box\b/i,
            /\bqty\s+in\s+this\s+box\b/i,
            /\bthis\s+box\b/i,
            /\bselected\s+box\b/i,
            /\banother\s+box\b/i,
            /\bone\s+box\s+into\s+another\s+box\b/i,
            /\bbox\s*\/\s*location\b/i,
            /\bbox\s+number\b/i,
            /\bclosest\s+available\s+box\b/i,
            /\bno\s+boxes?\b/i,
            /\bcould\s+not\s+load\s+boxes?\b/i,
            /\berror\s+(creating|loading|moving)\s+boxes?\b/i,
            /\bbox\s+move\s+(complete|partly completed)\b/i,
            /\bmove\s+everything\b[\s\S]{0,80}\bboxes?\b/i,
            /\bprint\s+product\s+labels,\s*box\s+labels\b/i,
            /\badd\s+item,\s*choose\s+box\b/i,
            /\bstorage\s+boxes?\b/i,
            /\bbox\s+locations?\b/i,
            /\bbox\s+labels?\b/i,
            /\bbox\s+suggestions?\b/i,
            /\bbox\s+contents?\b/i,
            /\bactive\s+boxes?\b/i,
            /\bempty\s+boxes?\b/i,
            /\blargest\s+box\b/i,
            /\bsmallest\s+box\b/i,
            /\bcreate\s+next\s+available\s+box\b/i,
            /\bcreate\s+new\s+box\b/i,
            /\bsort\s+by\s+box\s+number\b/i,
            /\bsearch\s+box\b/i,
            /\bselect\s+box\b/i,
            /\bloading\s+boxes?\b/i,
            /\bprint\s+box\s+label\b/i,
            /\bmove\s+whole\s+box\b/i,
            /\bbulk\s+box\s+move\b/i,
            /\bmove\s+everything\s+from\b[\s\S]{0,80}\bbox\b/i,
            /\bmove\s+everything\s+to\b[\s\S]{0,80}\bbox\b/i,
            /\bpick\s+from\s+the\s+boxes?\s+shown\s+below\b/i,
            /\breturn\s+box\s*\/\s*location\b/i,
            /\bselected\s+box\b/i,
            /\bclosest\s+available\s+box\b/i,
            /\bbox\s+number\b/i,
            /\bboxes?\s+shown\s+below\b/i,
            /\bboxes?\s+are\s+currently\b/i,
            /\bboxes?\s+remaining\b/i,
            /\bboxes?\s+available\b/i,
            /\bboxes?\s+found\b/i
        ];

        return patterns.some(pattern => pattern.test(text));
    }

    function elementIsProtected(element){
        if(!element || element.nodeType !== 1){
            return false;
        }

        if(SKIP_TAGS.has(element.tagName)){
            return true;
        }

        return Boolean(
            element.closest(
                PROTECTED_CONTENT_SELECTOR
            )
        );
    }

    function optionShouldTranslate(option){
        const select = option?.closest("select");

        if(!select){
            return looksLikeLocationUiText(
                option.textContent
            );
        }

        const id = String(select.id || "")
            .toLowerCase();

        const locationSelect =
            id.includes("box") ||
            id.includes("location") ||
            id.includes("from") ||
            id.includes("to") ||
            id.includes("bulk") ||
            id.includes("return");

        return (
            locationSelect ||
            looksLikeLocationUiText(
                option.textContent
            )
        );
    }

    function textNodeShouldTranslate(node){
        if(!node || node.nodeType !== 3){
            return false;
        }

        const parent = node.parentElement;

        if(!parent || elementIsProtected(parent)){
            return false;
        }

        const text = String(node.nodeValue || "");

        if(!/\bboxes?\b/i.test(text)){
            return false;
        }

        if(parent.tagName === "OPTION"){
            return optionShouldTranslate(parent);
        }

        if(parent.matches(UI_TEXT_SELECTOR)){
            /*
                Result headings sometimes contain product descriptions.
                Only translate those when they are clearly interface wording.
            */
            if(
                parent.closest(".result-card") &&
                /^H[1-6]$/.test(parent.tagName)
            ){
                return looksLikeLocationUiText(text);
            }

            return true;
        }

        return looksLikeLocationUiText(text);
    }

    function translateTextNode(node){
        if(!textNodeShouldTranslate(node)){
            return;
        }

        const current =
            String(node.nodeValue || "");

        const translated =
            replaceLocationWords(current);

        if(translated !== current){
            node.nodeValue = translated;
        }
    }

    function translateElementText(element){
        if(
            !element ||
            element.nodeType !== 1 ||
            elementIsProtected(element)
        ){
            return;
        }

        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT
        );

        const nodes = [];
        let current = walker.nextNode();

        while(current){
            nodes.push(current);
            current = walker.nextNode();
        }

        nodes.forEach(translateTextNode);
    }

    function translateAttributes(root){
        const elements = [];

        if(root?.nodeType === 1){
            elements.push(root);
        }

        if(root?.querySelectorAll){
            elements.push(
                ...root.querySelectorAll(
                    "[placeholder],[title],[aria-label]"
                )
            );
        }

        elements.forEach(element => {
            if(elementIsProtected(element)){
                return;
            }

            [
                "placeholder",
                "title",
                "aria-label"
            ].forEach(attribute => {
                if(!element.hasAttribute(attribute)){
                    return;
                }

                const current =
                    element.getAttribute(attribute) || "";

                if(!looksLikeLocationUiText(current)){
                    return;
                }

                const translated =
                    replaceLocationWords(current);

                if(translated !== current){
                    element.setAttribute(
                        attribute,
                        translated
                    );
                }
            });
        });
    }

    function translateUi(root = document){
        if(!root){
            return;
        }

        /*
            V1.0 only walked headings, buttons and a small selector list.
            Several existing pages place their interface wording inside plain
            div, p, span and strong elements, so those nodes were never seen.

            Walk every text node under the supplied root. The safety checks in
            textNodeShouldTranslate still protect product names, user notes,
            stored location names such as BOX-15, scripts and styles.
        */
        if(root.nodeType === 3){
            translateTextNode(root);
            return;
        }

        const walker = document.createTreeWalker(
            root,
            NodeFilter.SHOW_TEXT
        );

        const nodes = [];
        let current = walker.nextNode();

        while(current){
            nodes.push(current);
            current = walker.nextNode();
        }

        nodes.forEach(translateTextNode);
        translateAttributes(root);
    }

    function applyExplicitLabels(){
        const settings = getSettings();

        document
            .querySelectorAll(
                "[data-location-singular]"
            )
            .forEach(element => {
                element.textContent =
                    settings.location_label_singular ||
                    "Box";
            });

        document
            .querySelectorAll(
                "[data-location-plural]"
            )
            .forEach(element => {
                element.textContent =
                    settings.location_label_plural ||
                    "Boxes";
            });

        document
            .querySelectorAll(
                "[data-location-icon]"
            )
            .forEach(element => {
                element.textContent =
                    settings.location_icon ||
                    "📦";
            });
    }

    function applyLabels(){
        applyExplicitLabels();
        translateUi(document);
    }

    function startObserver(){
        if(observer || !document.body){
            return;
        }

        observer = new MutationObserver(
            function(mutations){
                mutations.forEach(mutation => {
                    if(
                        mutation.type ===
                        "characterData"
                    ){
                        translateTextNode(
                            mutation.target
                        );

                        return;
                    }

                    if(
                        mutation.type ===
                        "attributes"
                    ){
                        translateAttributes(
                            mutation.target
                        );

                        return;
                    }

                    mutation.addedNodes.forEach(node => {
                        if(node.nodeType === 3){
                            translateTextNode(node);
                            return;
                        }

                        if(node.nodeType === 1){
                            translateUi(node);

                            /*
                                Explicit data attributes may be added later by
                                dynamically-rendered page content.
                            */
                            if(
                                node.matches?.(
                                    "[data-location-singular]," +
                                    "[data-location-plural]," +
                                    "[data-location-icon]"
                                ) ||
                                node.querySelector?.(
                                    "[data-location-singular]," +
                                    "[data-location-plural]," +
                                    "[data-location-icon]"
                                )
                            ){
                                applyExplicitLabels();
                            }
                        }
                    });
                });
            }
        );

        observer.observe(
            document.body,
            {
                childList:true,
                subtree:true,
                characterData:true,
                attributes:true,
                attributeFilter:[
                    "placeholder",
                    "title",
                    "aria-label"
                ]
            }
        );
    }

    function localiseMessage(value){
        const text = String(value ?? "");

        return looksLikeLocationUiText(text)
            ? replaceLocationWords(text)
            : text;
    }

    function patchDialogs(){
        if(window.__inventoryLocationDialogsPatched){
            return;
        }

        const originalAlert =
            window.alert.bind(window);

        const originalConfirm =
            window.confirm.bind(window);

        const originalPrompt =
            window.prompt.bind(window);

        window.alert = function(message){
            return originalAlert(
                localiseMessage(message)
            );
        };

        window.confirm = function(message){
            return originalConfirm(
                localiseMessage(message)
            );
        };

        window.prompt = function(
            message,
            defaultValue
        ){
            return originalPrompt(
                localiseMessage(message),
                defaultValue
            );
        };

        window.__inventoryLocationDialogsPatched =
            true;
    }

    async function init(){
        patchDialogs();

        if(
            !hasInventoryAPI() ||
            !InventoryAPI.isLoggedIn()
        ){
            applyLabels();
            startObserver();
            return false;
        }

        try{
            await load();
        }catch(error){
            console.error(
                "Could not load workspace location labels:",
                error
            );
        }

        applyLabels();
        startObserver();

        return true;
    }

    return {
        load,
        init,
        getCached,
        getSettings,
        singular,
        plural,
        icon,
        applyLabels,
        translateUi,
        replaceLocationWords,
        localiseMessage
    };
})();

window.InventoryWorkspace =
    InventoryWorkspace;

function initialiseInventoryWorkspace(){
    InventoryWorkspace.init();
}

if(document.readyState === "loading"){
    document.addEventListener(
        "DOMContentLoaded",
        initialiseInventoryWorkspace,
        {
            once:true
        }
    );
}else{
    initialiseInventoryWorkspace();
}
