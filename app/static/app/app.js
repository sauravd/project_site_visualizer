(function(){
  const htmlLang = (document.documentElement.getAttribute('lang') || 'en').slice(0,2);
  let isAR = htmlLang === 'ar';

  // Elements
  const $ = id => document.getElementById(id);
  const $hdr=$('hdr'), $ftr=$('ftr');
  const $title=$('site-title'), $ft=$('footer-text');
  const $logoL=$('logo-left'), $logoR=$('logo-right');
  const $langSel=$('lang-select');
  const $region=$('filter-region'), $gov=$('filter-governorate'), $crop=$('filter-crop'),
        $water=$('filter-water'), $irr=$('filter-irr'), $farmer=$('filter-farmer'),
        $clear=$('filter-clear'), $custom=$('custom-filters');
  // NEW: Trees & Area selects (must exist in the template)
  const $treesRange = $('filter-trees-range');
  const $areaRange  = $('filter-area-range');

  // Label packs (fallbacks); template may override via #i18n data-*
  const LBL_EN = {
    region:'Region', governorate:'Governorate', crop:'Crop Type',
    water:'Water Source', irr:'Irrigation System Type', du:'Distribution Uniformity',
    // NEW
    trees:'Trees', area:'Area (m²)', nonNumeric:'Greenhouse'
  };
  const LBL_AR = {
    region:'المنطقة', governorate:'المحافظة', crop:'نوع المحصول',
    water:'مصدر المياه', irr:'نظام الري', du:'تجانس التوزيع',
    // NEW
    trees:'عدد الأشجار', area:'المساحة (م²)', nonNumeric:'غير رقمي'
  };
  const LBL = (() => {
    const d=(document.getElementById('i18n')||{}).dataset||{};
    const en = {
      region: d.region || LBL_EN.region,
      governorate: d.governorate || LBL_EN.governorate,
      crop: d['cropType'] || d['crop-type'] || LBL_EN.crop,
      water: d['waterSource'] || LBL_EN.water,
      irr: d['irrType'] || LBL_EN.irr,
      du: d.du || LBL_EN.du,
      trees: d.trees || LBL_EN.trees,
      area: d.area || LBL_EN.area,
      nonNumeric: d.nonNumeric || LBL_EN.nonNumeric,
    };
    const ar = {
      region: d.regionAr || LBL_AR.region,
      governorate: d.governorateAr || LBL_AR.governorate,
      crop: d.cropTypeAr || LBL_AR.crop,
      water: d.waterSourceAr || LBL_AR.water,
      irr: d.irrTypeAr || LBL_AR.irr,
      du: d.duAr || LBL_AR.du,
      trees: d.treesAr || LBL_AR.trees,
      area: d.areaAr || LBL_AR.area,
      nonNumeric: d.nonNumericAr || LBL_AR.nonNumeric,
    };
    return isAR ? ar : en;
  })();

  // Map
  const map = L.map('map', { worldCopyJump:false });
  let baseLayers = {};
  const markerLayer = L.layerGroup().addTo(map);

  // State
  let CFG=null, FEATURES=[];
  let dynFilters=[]; const dynEls={};

  const norm = s => (s??'').toString().trim();
  const nlow = s => norm(s).toLowerCase();
  const tFor = (p, en, ar) => (isAR && p[ar]) ? p[ar] : (p[en]||'');
  const pick = (...vals) => vals.find(v => v) || null;

  // ---------- Language switch (unchanged) ----------
  function getCSRF(){
    const m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }
  if ($langSel){
    $langSel.addEventListener('change', (e)=>{
      const lang = e.target.value || 'en';
      fetch('/i18n/setlang/', {
        method:'POST',
        headers:{'Content-Type':'application/x-www-form-urlencoded','X-CSRFToken': getCSRF()},
        body: new URLSearchParams({language: lang, next: window.location.pathname})
      }).then(()=>window.location.reload());
    });
  }

  function applyFavicon(cfg){
    if (!cfg.favicon) return;
    let link = document.querySelector('link[rel="icon"]');
    if (!link){ link = document.createElement('link'); link.rel='icon'; document.head.appendChild(link); }
    link.href = cfg.favicon;
  }
  function setChrome(cfg){
    $hdr.style.background = cfg.header_bg || '#02466b';
    $ftr.style.background = cfg.footer_bg || '#02466b';

    const titleText = isAR
      ? (cfg.title_ar || cfg.title_en || cfg.title || 'Sites Map')
      : (cfg.title_en || cfg.title_ar || cfg.title || 'Sites Map');
    $title.textContent = titleText;
    document.title = titleText;

    const year = new Date().getFullYear();
    const ftText = isAR
      ? (cfg.footer_text_ar || cfg.footer_text_en || cfg.footer_text || '')
      : (cfg.footer_text_en || cfg.footer_text_ar || cfg.footer_text || '');
    $ft.textContent = ftText ? ftText.replace(/\{year\}/gi, year) : `${year}`;

    const leftURL = isAR ? pick(cfg.logo_left_ar,  cfg.logo_left_en,  cfg.logo_left)
                         : pick(cfg.logo_left_en,  cfg.logo_left_ar,  cfg.logo_left);
    const rightURL= isAR ? pick(cfg.logo_right_ar, cfg.logo_right_en, cfg.logo_right)
                         : pick(cfg.logo_right_en, cfg.logo_right_ar, cfg.logo_right);
    if ($logoL){ if (leftURL){ $logoL.src=leftURL; $logoL.style.display=''; } else $logoL.style.display='none'; }
    if ($logoR){ if (rightURL){ $logoR.src=rightURL; $logoR.style.display=''; } else $logoR.style.display='none'; }

    if ($langSel) $langSel.value = isAR ? 'ar' : 'en';
    applyFavicon(cfg);
  }

  function buildLayers(cfg){
    const control={};
    baseLayers = {};
    (cfg.layers||[]).forEach(l=>{
      if (!l.active) return;
      const name = (isAR && l.name_ar) ? l.name_ar : l.name_en;
      const tl = L.tileLayer(l.url_template, {
        attribution:l.attribution||'',
        minZoom:l.min_zoom ?? 0,
        maxZoom:l.max_zoom ?? 19,
        subdomains:l.subdomains || undefined
      });
      control[name]=tl; baseLayers[l.slug]=tl;
      if (l.is_default) tl.addTo(map);
    });

    if (!Object.values(baseLayers).some(x=>map.hasLayer(x))){
      const fallback = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
        attribution:'© OpenStreetMap contributors', subdomains:'abc', maxZoom:19
      }).addTo(map);
      control['OpenStreetMap'] = fallback;
    }
    if (Object.keys(control).length>1){
      L.control.layers(control, {}).addTo(map);
    }
    setTimeout(()=>map.invalidateSize(), 0);
    window.addEventListener('resize', ()=>map.invalidateSize());
  }

  function showBuiltInFilters(cfg){
    const show = (el, yes) => { if (el) el.style.display = yes ? '' : 'none'; };
    show($region, cfg.show_filter_region);
    show($gov, cfg.show_filter_governorate);
    show($crop, cfg.show_filter_crop_type);
    show($water, cfg.show_filter_water_source);
    show($irr, cfg.show_filter_irrigation_type);

    // NEW — Trees & Area visibility (default to true if undefined)
    show($treesRange, cfg.show_filter_trees !== false);
    show($areaRange,  cfg.show_filter_area  !== false);
  }

  // Update placeholder (first option) with localized heading
  function setPlaceholder(select, label){
    if (!select) return;
    const ph = select.querySelector('option[value=""]') || select.querySelector('option');
    if (ph) ph.textContent = label;
  }

  function fillOptionsLocalized(select, enKey, arKey, headingLabel){
    if (!select) return;
    const first = select.querySelector('option');
    select.innerHTML=''; if (first) select.append(first);
    setPlaceholder(select, headingLabel || '');
    const seen = new Set(); const rows=[];
    FEATURES.forEach(f=>{
      const p=f.properties||{};
      const en = norm(p[enKey]); if (!en || seen.has(en)) return;
      seen.add(en);
      rows.push({value:en, label:tFor(p,enKey,arKey)});
    });
    rows.sort((a,b)=>a.label.localeCompare(b.label));
    rows.forEach(({value,label})=>select.appendChild(new Option(label,value)));
  }

  function buildDynamicFilters(){
    if (!$custom) return;
    $custom.innerHTML=''; dynFilters=[]; Object.keys(dynEls).forEach(k=>delete dynEls[k]);
    const byKey=new Map();
    FEATURES.forEach(f=>{
      (f.properties.extras||[]).forEach(ev=>{
        if (!ev.is_filterable) return;
        const bucket = byKey.get(ev.key) || { label_en:ev.label_en||ev.key, label_ar:ev.label_ar||ev.label_en, values:new Map() };
        const en = norm(ev.value_en); const ar = norm(ev.value_ar||'');
        if (en) bucket.values.set(en, ar);
        byKey.set(ev.key, bucket);
      });
    });
    byKey.forEach((bucket,key)=>{
      const select=document.createElement('select');
      const label = isAR ? bucket.label_ar : bucket.label_en;
      select.id=`f-${key}`; select.dataset.key=key;
      select.appendChild(new Option(label,''));
      const vals=[...bucket.values.keys()];
      vals.sort((a,b)=>{
        const la = isAR && bucket.values.get(a) ? bucket.values.get(a) : a;
        const lb = isAR && bucket.values.get(b) ? bucket.values.get(b) : b;
        return la.localeCompare(lb);
      });
      vals.forEach(en=>{
        const shown = (isAR && bucket.values.get(en)) ? bucket.values.get(en) : en;
        select.appendChild(new Option(shown, en));
      });
      select.addEventListener('change', render);
      $custom.appendChild(select);
      dynFilters.push({key, select}); dynEls[key]=select;
    });
  }

  // ---------- Helpers for numeric bucketing (NEW) ----------
  function parseIntOrNull(v){
    if (v === null || v === undefined) return null;
    const t = String(v).replace(/[, ]/g,'').trim();
    return /^\d+$/.test(t) ? parseInt(t, 10) : null;
  }
  function parseFloatOrNull(v){
    if (v === null || v === undefined) return null;
    const t = String(v).replace(/[, ]/g,'').trim();
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  function buildBins(min, max, k=5){
    if (min === null || max === null) return [];
    if (max < min) [min, max] = [max, min];
    if (min === max) return [[min, max]];
    const width = Math.ceil((max - min + 1) / k);
    const bins = [];
    let a = min, b = min + width - 1;
    for (let i=0;i<k;i++){
      if (i === k-1) b = max;
      bins.push([a, b]);
      a = b + 1;
      b = a + width - 1;
    }
    return bins;
  }
  function labelRange(a,b,unit){
    const dash = '–';
    const txt = `${a}${dash}${b}`;
    return unit ? `${txt} ${unit}` : txt;
  }

  // Build options for Trees/Area selects based on FEATURES (NEW)
  function ensureRangeFilters(){
    // TREES
    if ($treesRange){
      const first = $treesRange.querySelector('option') || document.createElement('option');
      $treesRange.innerHTML=''; first.value=''; first.textContent = LBL.trees; $treesRange.append(first);

      const nums = []; let hasNonNumeric = false;
      FEATURES.forEach(f=>{
        const v = f?.properties?.number_of_trees;
        if (v === undefined || v === null || String(v).trim()==='') return;
        const n = parseIntOrNull(v);
        if (n === null) hasNonNumeric = true; else nums.push(n);
      });

      if (nums.length){
        const min = Math.min(...nums), max = Math.max(...nums);
        const bins = buildBins(min, max, 5);
        bins.forEach(([a,b])=>{
          const val = `${a}-${b}`;
          const lab = labelRange(a,b, null);
          $treesRange.append(new Option(lab, val));
        });
      }
      if (hasNonNumeric){
        $treesRange.append(new Option(LBL.nonNumeric, 'non'));
      }
    }

    // AREA
    if ($areaRange){
      const first = $areaRange.querySelector('option') || document.createElement('option');
      $areaRange.innerHTML=''; first.value=''; first.textContent = LBL.area; $areaRange.append(first);

      const nums = [];
      FEATURES.forEach(f=>{
        const v = f?.properties?.area_m2;
        const n = parseFloatOrNull(v);
        if (n !== null) nums.push(n);
      });

      if (nums.length){
        const min = Math.floor(Math.min(...nums));
        const max = Math.ceil(Math.max(...nums));
        const bins = buildBins(min, max, 5);
        bins.forEach(([a,b])=>{
          const val = `${a}-${b}`;
          const lab = labelRange(a,b, isAR ? 'م²' : 'm²');
          $areaRange.append(new Option(lab, val));
        });
      }
    }
  }

  // ---------- Filtering ----------
  function matches(p){
    if ($region && $region.style.display!== "none" && $region.value && norm(p.region)!==$region.value) return false;
    if ($gov && $gov.style.display!== "none" && $gov.value && norm(p.governorate)!==$gov.value) return false;
    if ($crop && $crop.style.display!== "none" && $crop.value && norm(p.crop_type)!==$crop.value) return false;
    if ($water && $water.style.display!== "none" && $water.value && norm(p.water_source)!==$water.value) return false;
    if ($irr && $irr.style.display!== "none" && $irr.value && norm(p.irrigation_system_type)!==$irr.value) return false;

    // NEW — Trees range
    if ($treesRange && $treesRange.style.display !== "none" && $treesRange.value){
      const sel = $treesRange.value;
      const t = parseIntOrNull(p.number_of_trees);
      if (sel === 'non'){
        // keep only when the value exists but is non-numeric
        const has = p.number_of_trees != null && String(p.number_of_trees).trim() !== '';
        if (!has || t !== null) return false;
      } else {
        if (t === null) return false;
        const [a,b] = sel.split('-').map(x=>parseInt(x,10));
        if (!(t >= a && t <= b)) return false;
      }
    }

    // NEW — Area range
    if ($areaRange && $areaRange.style.display !== "none" && $areaRange.value){
      const sel = $areaRange.value;
      const aNum = parseFloatOrNull(p.area_m2);
      if (aNum === null) return false;
      const [a,b] = sel.split('-').map(x=>parseFloat(x));
      if (!(aNum >= a && aNum <= b)) return false;
    }

    // Dynamic filters (unchanged)
    for (const {key,select} of dynFilters){
      if (!select.value) continue;
      const hit = (p.extras||[]).some(ev=>ev.key===key && norm(ev.value_en)===select.value);
      if (!hit) return false;
    }

    const q = nlow($farmer && $farmer.value);
    if (q){
      const hay = [p.code, p.farmer_name, p.farmer_name_ar].map(nlow).join(' | ');
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  // ---------- Popup (added Total Area & Total Trees rows) ----------
  function popupHTML(p){
    const titleKey = isAR ? 'الموقع' : 'Site';
    const codeText = (p.code != null) ? `${titleKey}: ${p.code}` : titleKey;

    const du = p.distribution_uniformity_pct != null
      ? (p.distribution_uniformity_pct + '%')
      : '-';

    const region      = tFor(p,'region','region_ar');
    const governorate = tFor(p,'governorate','governorate_ar');
    const crop        = tFor(p,'crop_type','crop_type_ar');
    const water       = tFor(p,'water_source','water_source_ar');
    const irr         = tFor(p,'irrigation_system_type','irrigation_system_type_ar');
    const farmer      = tFor(p,'farmer_name','farmer_name_ar');
    const desc        = tFor(p,'description','description_ar');

    const LBL_FARMER = isAR ? 'اسم المزارع' : 'Farmer Name';
    const LBL_DESC   = isAR ? 'الوصف'       : 'Description';

    // NEW labels for popup rows
    const LBL_TOTAL_AREA  = isAR ? 'إجمالي المساحة (م²)' : 'Total Area (m²)';
    const LBL_TOTAL_TREES = isAR ? 'إجمالي الأشجار'      : 'Total Trees';

    // NEW values (support both possible property names to avoid breaking)
    const valOrDash = v => (v===null || v===undefined || String(v).trim()==='') ? '-' : v;
    const totalArea  = valOrDash(p.total_area_m2 ?? p.area_m2);
    const totalTrees = valOrDash(p.total_trees    ?? p.number_of_trees);

    const pdfBtn = p.design_pdf
      ? `<button class="pdf-open" data-url="${p.design_pdf}">${isAR?'عرض التصميم (PDF)':'View design (PDF)'}</button>`
      : '';

    const imgs = (p.images||[]).slice(0,12)
      .map(i=>`<a href="${i.image}" class="thumb" data-kind="img"><img src="${i.image}" alt=""/></a>`)
      .join('');

    return `
      <div class="popup" dir="${isAR ? 'rtl' : 'ltr'}">
        <div class="header-line">
          <div class="code-badge">${codeText}</div>
        </div>

        <div class="meta">
          <table>
            <tr><th>${LBL_FARMER}:</th><td>${farmer || '-'}</td></tr>
            <tr><th>${LBL.region}:</th><td>${region || '-'}</td></tr>
            <tr><th>${LBL.governorate}:</th><td>${governorate || '-'}</td></tr>
            <tr><th>${LBL.crop}:</th><td>${crop || '-'}</td></tr>
            <tr><th>${LBL.water}:</th><td>${water || '-'}</td></tr>
            <tr><th>${LBL.irr}:</th><td>${irr || '-'}</td></tr>

            <!-- NEW rows -->
            <tr><th>${LBL_TOTAL_AREA}:</th><td>${totalArea}</td></tr>
            <tr><th>${LBL_TOTAL_TREES}:</th><td>${totalTrees}</td></tr>

            <tr><th>${LBL.du}:</th><td>${du}</td></tr>
          </table>
        </div>

        <div class="divider"></div>
        <div class="section-title">${LBL_DESC}</div>
        <div class="desc">${desc || ''}</div>

        ${pdfBtn}
        <div class="gallery">${imgs}</div>
      </div>`;
  }

  function render(){
    markerLayer.clearLayers();
    const filtered = FEATURES.filter(f=>matches(f.properties||{}));
    const markers=[];
    filtered.forEach(f=>{
      const [lon,lat]=(f.geometry && f.geometry.coordinates)||[];
      if (lat==null || lon==null) return;
      const m = L.marker([lat,lon]).bindPopup(popupHTML(f.properties||{}));
      markerLayer.addLayer(m); markers.push(m);
    });
    if (markers.length){
      const b = L.featureGroup(markers).getBounds().pad(0.2);
      map.fitBounds(b, {maxZoom: 12});
    }else if (CFG){
      map.setView([CFG.default_center_lat, CFG.default_center_lon], CFG.default_zoom || 6);
    }
    setTimeout(()=>map.invalidateSize(), 0);
  }

  // ---------- Lightbox (images + PDF) — unchanged ----------
  const lb=document.createElement('div');
  lb.className='lb hidden';
  lb.innerHTML=`<div class="lb-backdrop"></div>
    <div class="lb-panel">
      <button class="lb-close" aria-label="${isAR?'إغلاق':'Close'}">×</button>
      <iframe class="lb-frame" style="display:none" frameborder="0"></iframe>
      <img class="lb-img" style="display:none" alt=""/>
      <button class="lb-prev" aria-label="${isAR?'السابق':'Previous'}">‹</button>
      <button class="lb-next" aria-label="${isAR?'التالي':'Next'}">›</button>
    </div>`;
  document.body.appendChild(lb);
  const lbFrame=lb.querySelector('.lb-frame'), lbImg=lb.querySelector('.lb-img');
  const lbClose=lb.querySelector('.lb-close'), lbBackdrop=lb.querySelector('.lb-backdrop');
  const prevBtn=lb.querySelector('.lb-prev'), nextBtn=lb.querySelector('.lb-next');
  let gallery=[], idx=0, mode='img';

  function openPDF(url){
    mode='pdf'; lbImg.style.display='none'; lbFrame.style.display='block'; lbFrame.src=url;
    lb.classList.remove('hidden'); document.body.style.overflow='hidden';
    prevBtn.style.display = nextBtn.style.display = 'none';
  }
  function openImages(urls, start=0){
    mode='img'; gallery=urls.slice(); idx=(start+gallery.length)%gallery.length;
    lbFrame.style.display='none'; lbImg.style.display='block'; lbImg.src=gallery[idx];
    lb.classList.remove('hidden'); document.body.style.overflow='hidden';
    prevBtn.style.display = nextBtn.style.display = (gallery.length>1?'':'none');
  }
  function closeLB(){
    lb.classList.add('hidden'); document.body.style.overflow='';
    lbImg.src=''; lbFrame.src='';
  }
  lbClose.addEventListener('click',closeLB); lbBackdrop.addEventListener('click',closeLB);
  prevBtn.addEventListener('click',()=>{ if(mode!=='img')return; idx=(idx-1+gallery.length)%gallery.length; lbImg.src=gallery[idx];});
  nextBtn.addEventListener('click',()=>{ if(mode!=='img')return; idx=(idx+1)%gallery.length; lbImg.src=gallery[idx];});
  document.addEventListener('keydown',e=>{
    if(lb.classList.contains('hidden')) return;
    if(e.key==='Escape') closeLB();
    if(mode==='img' && e.key==='ArrowLeft') prevBtn.click();
    if(mode==='img' && e.key==='ArrowRight') nextBtn.click();
  });
  document.body.addEventListener('click',e=>{
    const a = e.target.closest('.popup .gallery a');
    if (a){ e.preventDefault();
      const popup=e.target.closest('.popup');
      const links=[...popup.querySelectorAll('.gallery a')];
      const urls=links.map(el=>el.getAttribute('href'));
      openImages(urls, links.indexOf(a)); return;
    }
    const btn = e.target.closest('.popup .pdf-open');
    if (btn){ e.preventDefault(); openPDF(btn.dataset.url); }
  });

  // ---------- Events ----------
  [$region,$gov,$crop,$water,$irr,$treesRange,$areaRange]
    .filter(Boolean)
    .forEach(el=>el.addEventListener('change',render));

  if ($farmer) $farmer.addEventListener('input',()=>{ window.clearTimeout(window.__ft); window.__ft=setTimeout(render,250); });
  if ($clear) $clear.addEventListener('click',()=>{
    [$region,$gov,$crop,$water,$irr,$treesRange,$areaRange].filter(Boolean).forEach(el=>el.value='');
    $farmer && ($farmer.value='');
    Object.values(dynEls).forEach(el=>el.value='');
    render();
  });

  // ---------- Boot ----------
  Promise.all([
    fetch('/api/config/').then(r=>r.json()),
    fetch('/api/sites/').then(r=>r.json()),
  ]).then(([cfg,fc])=>{
    CFG=cfg;
    isAR = (document.documentElement.getAttribute('lang')||'en').slice(0,2)==='ar';
    setChrome(cfg);
    buildLayers(cfg);

    FEATURES = (fc && fc.features) ? fc.features : [];

    // NEW: build the two range selects based on data (must come before toggling visibility)
    ensureRangeFilters();

    // Toggle visibility based on Admin switches
    showBuiltInFilters(cfg);

    // Localize built-in filter headings/placeholder now
    setPlaceholder($region, LBL.region);
    setPlaceholder($gov,    LBL.governorate);
    setPlaceholder($crop,   LBL.crop);
    setPlaceholder($water,  LBL.water);
    setPlaceholder($irr,    LBL.irr);
    // NEW: placeholders for the new filters (ensureRangeFilters also sets, but safe)
    setPlaceholder($treesRange, LBL.trees);
    setPlaceholder($areaRange,  LBL.area);

    // Options for built-ins
    if ($region && $region.style.display!=='none') fillOptionsLocalized($region,'region','region_ar', LBL.region);
    if ($gov && $gov.style.display!=='none')       fillOptionsLocalized($gov,'governorate','governorate_ar', LBL.governorate);
    if ($crop && $crop.style.display!=='none')     fillOptionsLocalized($crop,'crop_type','crop_type_ar', LBL.crop);
    if ($water && $water.style.display!=='none')   fillOptionsLocalized($water,'water_source','water_source_ar', LBL.water);
    if ($irr && $irr.style.display!=='none')       fillOptionsLocalized($irr,'irrigation_system_type','irrigation_system_type_ar', LBL.irr);

    // Dynamic custom filters
    buildDynamicFilters();

    if (FEATURES.length){
      const group=L.featureGroup(FEATURES.map(f=>L.marker([f.geometry.coordinates[1], f.geometry.coordinates[0]])));
      map.fitBounds(group.getBounds().pad(0.2), {maxZoom: 12});
    }else{
      map.setView([cfg.default_center_lat, cfg.default_center_lon], cfg.default_zoom||6);
    }
    render();
  }).catch(err=>console.error('Boot error', err));
})();
