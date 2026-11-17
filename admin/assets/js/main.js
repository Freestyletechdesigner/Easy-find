/* ==========================================================================
   EasyFind Admin — Shared utilities
   ========================================================================== */

function showToast(message, type='success'){
  let stack = document.querySelector('.toast-stack');
  if(!stack){
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }
  const icon = type==='success' ? 'ri-checkbox-circle-fill' : 'ri-error-warning-fill';
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="${icon}"></i><p>${message}</p>`;
  stack.appendChild(el);
  setTimeout(()=>{
    el.style.transition = 'opacity .25s, transform .25s';
    el.style.opacity = '0';
    el.style.transform = 'translateX(20px)';
    setTimeout(()=>el.remove(), 250);
  }, 2800);
}

function openModal(id){
  const m = document.getElementById(id);
  if(m) m.classList.add('show');
}
function closeModal(id){
  const m = document.getElementById(id);
  if(m) m.classList.remove('show');
}
document.addEventListener('click', e=>{
  if(e.target.classList && e.target.classList.contains('modal-overlay')){
    e.target.classList.remove('show');
  }
});

function initTabs(root=document){
  root.querySelectorAll('.tabs').forEach(tabBar=>{
    const target = tabBar.getAttribute('data-target');
    tabBar.querySelectorAll('.tab-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        tabBar.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        const panelGroup = document.getElementById(target);
        if(panelGroup){
          panelGroup.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
          const panel = document.getElementById(btn.getAttribute('data-tab'));
          if(panel) panel.classList.add('active');
        }
      });
    });
  });
}

function initAmenityChips(root=document){
  root.querySelectorAll('.amenity-chip input').forEach(inp=>{
    const chip = inp.closest('.amenity-chip');
    if(inp.checked) chip.classList.add('active');
    inp.addEventListener('change', ()=>{
      chip.classList.toggle('active', inp.checked);
    });
  });
}

function initStatusToggle(root=document){
  root.querySelectorAll('.status-toggle').forEach(group=>{
    group.querySelectorAll('.status-opt').forEach(opt=>{
      opt.addEventListener('click', ()=>{
        group.querySelectorAll('.status-opt').forEach(o=>o.classList.remove('sel'));
        opt.classList.add('sel');
      });
    });
  });
}

/* Generic table search: filters rows in `tableSelector` by text typed in `inputSelector` */
function initTableSearch(inputSelector, tableSelector){
  const input = document.querySelector(inputSelector);
  const table = document.querySelector(tableSelector);
  if(!input || !table) return;
  input.addEventListener('input', ()=>{
    const q = input.value.trim().toLowerCase();
    table.querySelectorAll('tbody tr').forEach(row=>{
      row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
}

function initSelectAll(masterSelector, rowSelector){
  const master = document.querySelector(masterSelector);
  if(!master) return;
  master.addEventListener('change', ()=>{
    document.querySelectorAll(rowSelector).forEach(cb=>cb.checked = master.checked);
  });
}

document.addEventListener('DOMContentLoaded', ()=>{
  initTabs();
  initAmenityChips();
  initStatusToggle();

  // upload box preview (generic)
  document.querySelectorAll('.upload-input').forEach(inp=>{
    inp.addEventListener('change', e=>{
      const gridId = inp.getAttribute('data-grid');
      const grid = document.getElementById(gridId);
      if(!grid) return;
      Array.from(e.target.files).forEach(file=>{
        const reader = new FileReader();
        reader.onload = ev=>{
          const div = document.createElement('div');
          div.className = 'upload-thumb';
          div.innerHTML = `<img src="${ev.target.result}"><button type="button" class="rm">&times;</button>`;
          div.querySelector('.rm').addEventListener('click', ()=>div.remove());
          grid.appendChild(div);
        };
        reader.readAsDataURL(file);
      });
    });
  });
  document.querySelectorAll('.upload-thumb .rm').forEach(btn=>{
    btn.addEventListener('click', ()=>btn.closest('.upload-thumb').remove());
  });

  // generic "action button" toasts for demo interactivity
  document.querySelectorAll('[data-toast]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      showToast(btn.getAttribute('data-toast'), btn.getAttribute('data-toast-type') || 'success');
    });
  });

  // modal open/close triggers
  document.querySelectorAll('[data-open-modal]').forEach(btn=>{
    btn.addEventListener('click', ()=>openModal(btn.getAttribute('data-open-modal')));
  });
  document.querySelectorAll('[data-close-modal]').forEach(btn=>{
    btn.addEventListener('click', ()=>closeModal(btn.getAttribute('data-close-modal')));
  });
});
