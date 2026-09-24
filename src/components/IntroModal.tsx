import React from 'react';

export function IntroModal({ onStart }: { onStart: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/90 backdrop-blur-2xl">
      <div className="bg-[#0d0d12] border border-white/5 rounded-[3rem] p-10 max-w-lg w-full shadow-[0_0_100px_rgba(99,102,241,0.15)] space-y-10 animate-in zoom-in-95 duration-500">
        <div className="space-y-6 text-center">
          <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center mx-auto shadow-2xl rotate-6 ring-4 ring-indigo-500/20">
            <span className="material-symbols-outlined text-4xl text-white">auto_fix_high</span>
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-black tracking-tighter text-white uppercase">Магический Редактор</h1>
            <p className="text-slate-500 text-sm font-medium">Выбирайте объекты на фото и меняйте их мгновенно с помощью ИИ.</p>
          </div>
        </div>

        <ul className="space-y-6">
          {[
            { icon: 'upload_file', text: 'Загрузите любое изображение для анализа' },
            { icon: 'target', text: 'Нажмите на объект, чтобы выбрать его для редактирования' },
            { icon: 'edit_note', text: 'Опишите изменения: цвет, стиль или новый предмет' },
          ].map((item, i) => (
            <li key={i} className="flex items-center gap-5 text-slate-300">
              <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-2xl text-indigo-400">{item.icon}</span>
              </div>
              <span className="text-sm font-bold tracking-tight leading-relaxed">{item.text}</span>
            </li>
          ))}
        </ul>

        <button
          onClick={onStart}
          className="w-full py-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest transition-all shadow-[0_20px_40px_rgba(79,70,229,0.3)] active:scale-95"
        >
          Начать редактирование
        </button>
      </div>
    </div>
  );
}