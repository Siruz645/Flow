import React from 'react';

interface GuideDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPrompt?: (prompt: string, model: string, aspect: string) => void;
}

export function ImageToolboxGuide({ isOpen, onClose, onSelectPrompt }: GuideDrawerProps) {
  if (!isOpen) return null;

  const TEST_PRESETS = [
    {
      title: 'Флагманский фотореализм (Nano Banana Pro)',
      model: '🍌 Nano Banana Pro',
      aspect: '1:1',
      prompt: 'A close-up portrait of a majestic snow leopard in a snowy mountain peak at dusk, cinematic natural lighting, 8k ultra-detailed fur, National Geographic photography'
    },
    {
      title: 'Киберпанк архитектура (Landscape 16:9)',
      model: '🍌 Nano Banana Pro',
      aspect: '16:9',
      prompt: 'Isometric futuristic neon metropolis with flying hover-vehicles, rain reflections, towering holographic billboards, cyberpunk blade runner aesthetic'
    },
    {
      title: 'Вертикальный портрет для Shorts (Nano Banana 2)',
      model: 'Nano Banana 2',
      aspect: '9:16',
      prompt: 'Stylish anime girl warrior with glowing cyan braided hair wearing high-tech streetwear, neon Tokyo background, vibrant colors'
    },
    {
      title: 'Фэнтези макросъемка (Nano Banana Pro)',
      model: '🍌 Nano Banana Pro',
      aspect: '4:3',
      prompt: 'Macro shot of a magical glowing crystal mushroom in an enchanted misty moss forest, bioluminescent spores floating, bokeh, 8k render'
    }
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Slide-Over Drawer Panel */}
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-lg bg-[#0c0c12] border-l border-white/10 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 text-slate-100 font-sans">
          
          {/* Drawer Header */}
          <div className="p-5 border-b border-white/10 flex items-center justify-between bg-[#11111a]">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">📖</span>
              <div>
                <h2 className="text-sm font-black uppercase tracking-wider text-white">
                  Справочник & Тестовые Пресеты
                </h2>
                <p className="text-[11px] text-slate-400">
                  Быстрый тест генерации и подсказки по инструментам
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
              title="Закрыть (ESC)"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            
            {/* Quick Test Presets */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-violet-400 flex items-center gap-1.5">
                  <span>⚡</span> Быстрые Пресеты
                </h3>
                <span className="text-[10px] text-slate-500 font-mono">1 клик для теста</span>
              </div>

              <div className="space-y-2.5">
                {TEST_PRESETS.map((preset, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl border border-white/5 bg-[#14141f] hover:border-violet-500/40 transition-all flex flex-col justify-between gap-2.5 group"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-200 group-hover:text-violet-300 transition-colors line-clamp-1">
                          {preset.title}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                          {preset.aspect}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">
                        "{preset.prompt}"
                      </p>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-white/5">
                      <span className="text-[10px] font-mono text-slate-500">{preset.model}</span>
                      <button
                        onClick={() => {
                          if (onSelectPrompt) onSelectPrompt(preset.prompt, preset.model, preset.aspect);
                          onClose();
                        }}
                        className="px-3 py-1 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shadow-md shadow-violet-600/20 active:scale-95"
                      >
                        <span>Применить</span>
                        <span className="material-symbols-outlined text-xs">arrow_forward</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Documentation / Capabilities */}
            <div className="space-y-3 pt-2 border-t border-white/10">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                🛠 Как пользоваться студией
              </h3>

              <div className="space-y-3">
                {/* Section 1 */}
                <div className="p-3.5 rounded-xl border border-white/5 bg-[#14141f] space-y-2">
                  <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <span>🍌</span> 1. Базовая генерация (Text-to-Image)
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Создает изображение с нуля через <span className="text-white font-semibold">Imagen 3</span>. Выберите модель (<span className="text-violet-300">Banana Pro</span> для максимальной четкости 1K-4K), укажите пропорции и нажмите «Сгенерировать».
                  </p>
                </div>

                {/* Section 2 */}
                <div className="p-3.5 rounded-xl border border-white/5 bg-[#14141f] space-y-2">
                  <div className="text-xs font-bold text-violet-400 flex items-center gap-1.5">
                    <span>✨</span> 2. Magic Inpainting (Точечная замена)
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Нажмите <span className="text-violet-300 font-semibold">«В Magic Editor»</span> на сгенерированной картинке. ИИ сам определит объекты на фото, либо выделите область рамкой и напишите, что изменить. Фон останется 100% нетронутым.
                  </p>
                </div>

                {/* Section 3 */}
                <div className="p-3.5 rounded-xl border border-white/5 bg-[#14141f] space-y-2">
                  <div className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                    <span>💻</span> 3. Консольный запуск (CLI)
                  </div>
                  <div className="bg-black/60 p-2.5 rounded-lg font-mono text-[10px] text-cyan-300 space-y-1 overflow-x-auto">
                    <div>python tools/generate_flow_image.py "Промпт" --model pro --aspect 1:1</div>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Drawer Footer */}
          <div className="p-4 border-t border-white/10 bg-[#11111a] flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Google Flow Engine</span>
            </span>
            <button
              onClick={onClose}
              className="text-xs text-slate-300 hover:text-white px-3 py-1 rounded bg-slate-800/60 hover:bg-slate-800 transition-colors"
            >
              Закрыть
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
